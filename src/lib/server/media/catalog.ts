/**
 * Catalog provider — our own Xtream portals, served from the local Movies/Series tables.
 *
 * This is the default (and legally-clean) media source: every title here was imported by
 * an operator's own source sync, every play URL is minted server-side and handed to the
 * client only as an opaque signed proxy token.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { portalValidityClause, splitPipe } from "@/lib/server/iptv";
import { signedProxyPath } from "@/lib/server/proxy-sign";
import { movieStreamUrl } from "@/lib/server/sync/vod";
import { episodeStreamUrl, seriesWithEpisodes } from "@/lib/server/sync/series";
import {
  mediaId,
  type EpisodeRef,
  type MediaCard,
  type MediaContext,
  type MediaDetail,
  type MediaHome,
  type MediaProvider,
  type MediaRail,
  type MediaSources,
  type MediaTab,
} from "./types";

const RAIL_SIZE = 18;
const TABS: MediaHome["tabs"] = [
  { key: "home", label: "For you" },
  { key: "movies", label: "Movies" },
  { key: "series", label: "TV Shows" },
];

/** Rails are cheap but not free (5 queries) — a few minutes of memory cache is plenty. */
const CACHE_TTL_MS = 3 * 60 * 1000;
const railCache = new Map<string, { at: number; home: MediaHome }>();

/**
 * The "this row is actually watchable" clause for VOD.
 *
 * Returns the plain Prisma filter type, not `{…} & Prisma.MovieWhereInput`: the intersection made
 * the literals *both* a value and a filter (`true & BoolFilter<"Movie">`), which Prisma's own
 * types reject — `tsc` (and therefore `next build`, which type-checks) failed with 4 errors here
 * that the ungenerated local client hid.
 */
function liveSource(organizationId: string): Prisma.MovieWhereInput {
  return {
    organizationId,
    isActive: true,
    isNsfw: false,
    ...(portalValidityClause() as Prisma.MovieWhereInput),
  };
}

/**
 * The same clause for Series. Movie and Series share these columns, so the shape is identical —
 * but the *types* are not interchangeable, so series queries get their own builder instead of a
 * `{ ...movieWhere } as Prisma.SeriesWhereInput` cast at each call site.
 */
function liveSeriesSource(organizationId: string): Prisma.SeriesWhereInput {
  return {
    organizationId,
    isActive: true,
    isNsfw: false,
    ...(portalValidityClause() as Prisma.SeriesWhereInput),
  };
}

function toCard(kind: "movie" | "series", row: {
  id: string;
  title: string;
  poster: string | null;
  year: string | null;
  rating: string | null;
  plot?: string | null;
  genre?: string | null;
}): MediaCard {
  return {
    id: mediaId("catalog", kind, row.id),
    provider: "catalog",
    kind,
    title: row.title,
    poster: row.poster,
    backdrop: null,
    year: row.year,
    rating: row.rating,
    plot: row.plot ?? null,
    badges: row.genre ? [row.genre] : [],
  };
}

const MOVIE_CARD_SELECT = { id: true, title: true, poster: true, year: true, rating: true, genre: true } as const;
const SERIES_CARD_SELECT = { id: true, title: true, poster: true, year: true, rating: true, genre: true } as const;

/** Dedupe by identityKey so the same film from three portals is one card. */
function dedupe<T extends { title: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function genreRail(
  ctx: MediaContext,
  kind: "movie" | "series",
  genre: string,
): Promise<MediaRail | null> {
  // Two typed wheres: a Movie filter must never be handed to the Series table (it used to be).
  const movieWhere: Prisma.MovieWhereInput = { ...liveSource(ctx.organizationId), genre };
  const seriesWhere: Prisma.SeriesWhereInput = { ...liveSeriesSource(ctx.organizationId), genre };
  const rows =
    kind === "movie"
      ? await db.movie.findMany({
          where: movieWhere,
          select: MOVIE_CARD_SELECT,
          orderBy: { addedAt: "desc" },
          take: RAIL_SIZE,
        })
      : await db.series.findMany({
          where: seriesWhere,
          select: SERIES_CARD_SELECT,
          orderBy: { addedAt: "desc" },
          take: RAIL_SIZE,
        });
  const items = dedupe(rows).map((row) => toCard(kind, row));
  if (items.length < 4) return null;
  return {
    key: `${kind}-genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: `${genre} ${kind === "movie" ? "movies" : "shows"}`,
    items,
  };
}

async function buildHome(ctx: MediaContext): Promise<MediaHome> {
  const movieWhere: Prisma.MovieWhereInput = liveSource(ctx.organizationId);
  const seriesWhere: Prisma.SeriesWhereInput = liveSeriesSource(ctx.organizationId);

  const [movies, series, movieGenres, seriesGenres] = await Promise.all([
    db.movie.findMany({
      where: movieWhere,
      select: MOVIE_CARD_SELECT,
      orderBy: { addedAt: "desc" },
      take: RAIL_SIZE,
    }),
    db.series.findMany({
      where: seriesWhere,
      select: SERIES_CARD_SELECT,
      orderBy: { addedAt: "desc" },
      take: RAIL_SIZE,
    }),
    db.movie.groupBy({
      by: ["genre"],
      where: movieWhere,
      _count: { genre: true },
      orderBy: { _count: { genre: "desc" } },
      take: 4,
    }),
    db.series.groupBy({
      by: ["genre"],
      where: seriesWhere,
      _count: { genre: true },
      orderBy: { _count: { genre: "desc" } },
      take: 3,
    }),
  ]);

  const movieCards = dedupe(movies).map((row) => toCard("movie", row));
  const seriesCards = dedupe(series).map((row) => toCard("series", row));

  // hero = the freshest titles from both sides, alternating so the carousel feels mixed
  const hero: MediaCard[] = [];
  for (let i = 0; i < Math.max(movieCards.length, seriesCards.length) && hero.length < 6; i += 1) {
    if (seriesCards[i]) hero.push(seriesCards[i]);
    if (movieCards[i]) hero.push(movieCards[i]);
  }

  const genreRails = await Promise.all([
    ...movieGenres
      .map((g) => g.genre)
      .filter((g): g is string => !!g && g.trim().length > 0)
      .map((genre) => genreRail(ctx, "movie", genre)),
    ...seriesGenres
      .map((g) => g.genre)
      .filter((g): g is string => !!g && g.trim().length > 0)
      .map((genre) => genreRail(ctx, "series", genre)),
  ]);

  const rails: MediaRail[] = [
    { key: "series-new", title: "New TV shows", items: seriesCards },
    { key: "movies-new", title: "New movies", items: movieCards },
    ...genreRails.filter((rail): rail is MediaRail => rail !== null),
  ].filter((rail) => rail.items.length > 0);

  return { provider: "catalog", tabs: TABS, hero, rails, geo: null };
}

async function home(ctx: MediaContext, tab: MediaTab): Promise<MediaHome> {
  const cacheKey = `${ctx.organizationId}:${tab}`;
  const cached = railCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.home;

  const built = await buildHome(ctx);
  const filtered: MediaHome =
    tab === "movies"
      ? { ...built, hero: built.hero.filter((c) => c.kind === "movie"), rails: built.rails.filter((r) => r.key.startsWith("movie")) }
      : tab === "series"
        ? { ...built, hero: built.hero.filter((c) => c.kind === "series"), rails: built.rails.filter((r) => r.key.startsWith("series")) }
        : built;
  railCache.set(cacheKey, { at: Date.now(), home: filtered });
  return filtered;
}

async function search(ctx: MediaContext, query: string): Promise<MediaCard[]> {
  const q = query.trim();
  if (!q) return [];
  const movieWhere = { ...liveSource(ctx.organizationId), title: { contains: q } };
  const [movies, series] = await Promise.all([
    db.movie.findMany({ where: movieWhere, select: MOVIE_CARD_SELECT, orderBy: { title: "asc" }, take: 24 }),
    db.series.findMany({
      where: { ...liveSeriesSource(ctx.organizationId), title: { contains: q } },
      select: SERIES_CARD_SELECT,
      orderBy: { title: "asc" },
      take: 24,
    }),
  ]);
  return [...dedupe(movies).map((r) => toCard("movie", r)), ...dedupe(series).map((r) => toCard("series", r))];
}

async function detail(ctx: MediaContext, id: string): Promise<MediaDetail | null> {
  const ref = id.replace(/^catalog:(movie|series):/, "");
  if (!ref) return null;

  const movie = await db.movie.findFirst({
    where: { id: ref, ...liveSource(ctx.organizationId) },
    select: { ...MOVIE_CARD_SELECT, plot: true, categories: true, containerExt: true },
  });
  if (movie) {
    const src = await movieStreamUrl(movie.id, ctx.organizationId);
    return {
      ...toCard("movie", movie),
      genres: splitPipe(movie.categories),
      seasons: [],
      playUrl: src ? signedProxyPath(src.url, src.ua, src.ref) : null,
      needsEpisode: false,
    };
  }

  const series = await seriesWithEpisodes(ref, ctx.organizationId);
  if (!series) return null;
  return {
    id: mediaId("catalog", "series", series.id),
    provider: "catalog",
    kind: "series",
    title: series.title,
    poster: series.poster,
    backdrop: null,
    year: series.year,
    rating: series.rating,
    plot: series.plot,
    badges: series.genre ? [series.genre] : [],
    genres: series.genre ? series.genre.split(/[,/]/).map((g) => g.trim()).filter(Boolean) : [],
    seasons: series.seasons,
    playUrl: null,
    needsEpisode: series.seasons.length > 0,
  };
}

async function sources(ctx: MediaContext, id: string, episode?: EpisodeRef): Promise<MediaSources | null> {
  const parsed = id.replace(/^catalog:(movie|series):/, "");
  if (!parsed) return null;

  if (id.includes(":series:")) {
    const season = episode?.season ?? 1;
    const ep = episode?.episode ?? 1;
    const resolved = await episodeStreamUrl(parsed, ctx.organizationId, season, ep);
    if (!resolved) return null;
    return {
      title: resolved.title,
      startAt: 0,
      sources: [
        {
          id: `${id}:${season}:${ep}`,
          server: "Your provider",
          label: `S${String(season).padStart(2, "0")}E${String(ep).padStart(2, "0")}`,
          quality: null,
          type: /\.m3u8(?:$|\?)/i.test(resolved.url) ? "hls" : "file",
          url: signedProxyPath(resolved.url),
          subtitles: [],
        },
      ],
    };
  }

  const movie = await db.movie.findFirst({
    where: { id: parsed, ...liveSource(ctx.organizationId) },
    select: { id: true, title: true, containerExt: true },
  });
  if (!movie) return null;
  const src = await movieStreamUrl(movie.id, ctx.organizationId);
  if (!src) return null;
  return {
    title: movie.title,
    startAt: 0,
    sources: [
      {
        id: movie.id,
        server: "Your provider",
        label: "Auto",
        quality: null,
        type: /\.m3u8(?:$|\?)/i.test(src.url) ? "hls" : "file",
        url: signedProxyPath(src.url, src.ua, src.ref),
        subtitles: [],
      },
    ],
  };
}

export const catalogProvider: MediaProvider = {
  name: "catalog",
  description: "Your own sources (Xtream portal Movies & TV Shows)",
  home,
  search,
  detail,
  sources,
};
