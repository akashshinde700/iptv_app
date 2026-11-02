/**
 * Media-hub contracts.
 *
 * StreamKaro's catalogs come from two very different worlds: our own Xtream portals
 * (Movies/Series tables in MySQL) and, optionally, an external TMDB-style aggregator.
 * The UI must not care which one answered, so both are normalised into these shapes.
 *
 * Rule of thumb: **nothing in here may contain an upstream URL with credentials**.
 * Stream URLs only ever leave the server as an opaque `/api/proxy?t=…` path.
 */

export type MediaKind = "movie" | "series";

/** Which tab a title belongs to in the hub. */
export type MediaTab = "home" | "movies" | "series" | "anime";

export interface MediaCard {
  /** provider-qualified id, e.g. `catalog:movie:clx123` or `nxsha:movie:1400940` */
  id: string;
  provider: MediaProviderName;
  kind: MediaKind;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: string | null;
  rating: string | null;
  plot: string | null;
  /** free-form chips shown on the card, e.g. ["Hindi", "4K"] */
  badges: string[];
}

export interface MediaRail {
  key: string;
  title: string;
  items: MediaCard[];
}

export interface MediaHome {
  provider: MediaProviderName;
  tabs: { key: MediaTab; label: string }[];
  hero: MediaCard[];
  rails: MediaRail[];
  /** present when the provider is geo-aware (nxsha) — shown in the hub header */
  geo: { country: string; name: string } | null;
}

export interface MediaEpisode {
  id: string;
  season: number;
  episode: number;
  title: string;
  plot: string | null;
  still: string | null;
  durationSecs: number | null;
  rating: string | null;
}

export interface MediaSeason {
  season: number;
  name: string;
  episodes: MediaEpisode[];
}

export interface MediaDetail extends MediaCard {
  genres: string[];
  seasons: MediaSeason[];
  /** movies only: a ready-to-play signed proxy path (null when the source is missing) */
  playUrl: string | null;
  /** series only: nothing to play until an episode is chosen */
  needsEpisode: boolean;
}

export interface MediaSubtitle {
  id: string;
  label: string;
  lang: string;
  url: string;
}

export interface MediaSource {
  id: string;
  /** provider/server name, e.g. "Nitro" or the portal name */
  server: string;
  label: string;
  quality: string | null;
  type: "hls" | "file";
  /**
   * Signed same-origin proxy path — never a raw upstream URL.
   * The one exception is a third-party embed player, which is an absolute https URL by design
   * (an iframe needs a real document); such sources are flagged `embed` and must never be
   * handed to the hls.js player.
   */
  url: string;
  subtitles: MediaSubtitle[];
  /** last-resort third-party iframe player, only emitted when every scraper failed */
  embed?: boolean;
}

export interface MediaSources {
  title: string;
  sources: MediaSource[];
  /** start position in seconds for resume-playback (0 when unknown) */
  startAt: number;
}

export type MediaProviderName = "catalog" | "nxsha";

export interface MediaContext {
  organizationId: string;
  /** customer's country, when the provider is geo-aware */
  country?: string;
}

export interface EpisodeRef {
  season: number;
  episode: number;
}

export interface MediaProvider {
  name: MediaProviderName;
  /** one-line description shown in Settings / admin */
  description: string;
  home(ctx: MediaContext, tab: MediaTab): Promise<MediaHome>;
  search(ctx: MediaContext, query: string): Promise<MediaCard[]>;
  /** `season` only matters for series whose episode list is fetched per-season (nxsha). */
  detail(ctx: MediaContext, id: string, season?: number): Promise<MediaDetail | null>;
  sources(ctx: MediaContext, id: string, episode?: EpisodeRef): Promise<MediaSources | null>;
}

/** Split a provider-qualified id into its parts. */
export function parseMediaId(id: string): { provider: MediaProviderName; kind: MediaKind; ref: string } | null {
  const [provider, kind, ...rest] = id.split(":");
  const ref = rest.join(":");
  if ((provider !== "catalog" && provider !== "nxsha") || (kind !== "movie" && kind !== "series") || !ref) return null;
  return { provider, kind, ref };
}

export function mediaId(provider: MediaProviderName, kind: MediaKind, ref: string): string {
  return `${provider}:${kind}:${ref}`;
}
