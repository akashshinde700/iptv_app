/* Client-side media-hub API. Mirrors src/lib/server/media/types.ts (never import server code
   from a client component — it would drag `node:crypto` into the browser bundle). */
import { ApiError } from "@/lib/api";

export type MediaKind = "movie" | "series";
export type MediaTab = "home" | "movies" | "series" | "anime";

export interface MediaCard {
  id: string;
  provider: "catalog" | "nxsha";
  kind: MediaKind;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: string | null;
  rating: string | null;
  plot: string | null;
  badges: string[];
}

export interface MediaRail {
  key: string;
  title: string;
  items: MediaCard[];
}

export interface MediaHome {
  provider: "catalog" | "nxsha";
  tabs: { key: MediaTab; label: string }[];
  hero: MediaCard[];
  rails: MediaRail[];
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
  playUrl: string | null;
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
  server: string;
  label: string;
  quality: string | null;
  type: "hls" | "file";
  /** opaque same-origin /api/proxy path, or an absolute https URL when `embed` is set */
  url: string;
  subtitles: MediaSubtitle[];
  /** third-party iframe player fallback — render in an iframe, never in the video element */
  embed?: boolean;
}

export interface MediaSources {
  title: string;
  sources: MediaSource[];
  startAt: number;
}

async function getJson<T>(url: string, fallbackMessage: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? fallbackMessage, data);
  }
  return (await res.json()) as T;
}

export function fetchMediaHome(tab: MediaTab): Promise<MediaHome> {
  return getJson(`/api/media/home?tab=${tab}`, "Failed to load the media hub");
}

export function fetchMediaSearch(query: string): Promise<{ items: MediaCard[] }> {
  return getJson(`/api/media/search?q=${encodeURIComponent(query)}`, "Search failed");
}

export function fetchMediaTitle(id: string, season = 1): Promise<MediaDetail> {
  return getJson(`/api/media/title/${encodeURIComponent(id)}?season=${season}`, "Title not found");
}

export function fetchMediaSources(
  id: string,
  opts: { season?: number; episode?: number } = {},
): Promise<MediaSources> {
  const qs = new URLSearchParams();
  if (opts.season) qs.set("season", String(opts.season));
  if (opts.episode) qs.set("episode", String(opts.episode));
  const suffix = qs.toString();
  return getJson(
    `/api/media/sources/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ""}`,
    "No playable source for this title",
  );
}
