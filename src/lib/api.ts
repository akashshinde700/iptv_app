import type {
  ChannelDetail,
  ChannelListParams,
  ChannelItem,
  FeaturedResponse,
  MetaResponse,
  Paged,
  PublicPlan,
} from "@/lib/types";

/** Error carrying the HTTP status so views can react to 403 (plan required). */
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown> | null;

  constructor(status: number, message: string, data: Record<string, unknown> | null = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Stream URLs arrive from the API already pointing at the signed same-origin `/api/proxy` path
 * (Referer/UA/CORS + HMAC handled server-side). This is a defensive passthrough for a raw URL.
 *
 * The old fallback built `/api/proxy?url=…` by hand — but `/api/proxy` requires an HMAC
 * signature, so that "fallback" was a guaranteed 403 (and the player showed a source error for
 * every channel whose stream record lacked a signed path). Returning the raw URL lets the player
 * try it directly (many CDNs allow it), and it is *never worse* than a link that always fails.
 */
export function toPlayableUrl(url: string): string {
  if (url.startsWith("/api/proxy")) return url;
  // A same-origin relative path is already playable as-is.
  if (url.startsWith("/")) return url;
  return url;
}

function buildListQuery(params: ChannelListParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.country) qs.set("country", params.country);
  if (params.category) qs.set("category", params.category);
  if (params.language) qs.set("language", params.language);
  if (params.nsfw) qs.set("nsfw", "true");
  qs.set("page", String(params.page ?? 1));
  qs.set("pageSize", String(params.pageSize ?? 24));
  qs.set("sort", params.sort ?? "name");
  return qs.toString();
}

/**
 * Plan-gated catalog. Throws ApiError(403) for guests / lapsed plans —
 * BrowseView catches it and shows the upsell instead.
 */
export async function fetchChannels(
  params: ChannelListParams
): Promise<Paged<ChannelItem>> {
  const res = await fetch(`/api/channels?${buildListQuery(params)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? "Failed to load channels", data);
  }
  return res.json();
}

export async function fetchChannelById(id: string): Promise<ChannelDetail> {
  const res = await fetch(`/api/channels/${id}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? "Channel not found", data);
  }
  const data = await res.json();
  return data.channel as ChannelDetail;
}

export async function fetchChannelsByIds(ids: string[]): Promise<ChannelItem[]> {
  if (ids.length === 0) return [];
  const res = await fetch(`/api/channels/by-ids?ids=${ids.slice(0, 200).join(",")}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? "Failed to load channels", data);
  }
  const data = await res.json();
  return (data.items as ChannelItem[]) ?? [];
}

/** Public demo channels — the only catalog guests can watch. */
export async function fetchDemoChannels(): Promise<{ items: ChannelItem[] }> {
  const res = await fetch("/api/demo/channels");
  if (!res.ok) throw new ApiError(res.status, "Failed to load demo channels");
  return res.json();
}

/**
 * Facet counts. Passing the currently-active filters makes each facet reflect the
 * others (pick a language → category / country counts narrow to it), so a category
 * with no channels in the chosen language simply disappears from the list.
 */
export async function fetchMeta(
  filters: { language?: string; country?: string; category?: string } = {}
): Promise<MetaResponse> {
  const qs = new URLSearchParams();
  if (filters.language) qs.set("language", filters.language);
  if (filters.country) qs.set("country", filters.country);
  if (filters.category) qs.set("category", filters.category);
  const suffix = qs.toString();
  const res = await fetch(`/api/meta${suffix ? `?${suffix}` : ""}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load stats");
  return res.json();
}

export async function fetchPlans(): Promise<PublicPlan[]> {
  const res = await fetch("/api/plans");
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? "Failed to load plans", data);
  }
  return ((await res.json()).items as PublicPlan[]) ?? [];
}

export async function fetchFeatured(): Promise<FeaturedResponse> {
  const res = await fetch("/api/featured");
  if (!res.ok) throw new ApiError(res.status, "Failed to load featured rows");
  return res.json();
}

/* --------------------------------- Movies (VOD) --------------------------------- */

export interface MovieItem {
  id: string;
  title: string;
  poster: string | null;
  year: string | null;
  rating: string | null;
  genre: string | null;
  categories: string[];
  sourceCount: number;
}

export interface MovieDetail {
  id: string;
  title: string;
  poster: string | null;
  plot: string | null;
  year: string | null;
  rating: string | null;
  genre: string | null;
  categories: string[];
  containerExt: string | null;
  playUrl: string | null;
}

export async function fetchMovies(params: {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  sort?: "name" | "nameDesc";
} = {}): Promise<{ items: MovieItem[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.sort) qs.set("sort", params.sort);
  const res = await fetch(`/api/movies?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Failed to load movies", data);
  return data as { items: MovieItem[]; total: number; page: number; pageSize: number; totalPages: number };
}

export async function fetchMovieById(id: string): Promise<MovieDetail> {
  const res = await fetch(`/api/movies/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Failed to load movie", data);
  return (data as { movie: MovieDetail }).movie;
}

/** Personal M3U playlist link for the signed-in customer (Settings → "Watch in another app"). */
export async function fetchMyPlaylist(): Promise<{
  path: string;
  url: string;
  apps: string[];
  note: string;
}> {
  const res = await fetch("/api/my/playlist", { cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? "Playlist unavailable", data);
  }
  return res.json();
}
