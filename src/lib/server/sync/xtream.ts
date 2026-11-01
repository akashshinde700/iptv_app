/* Xtream Codes API client — player_api for account info, get.php for playlist,
   with a player_api get_live_streams fallback when get.php is blocked (404/403). */

import { detectAdult, detectCategory, detectQuality, type ParsedChannel } from './m3u'
import { fetchPlaylist, parseM3U } from './m3u'

export interface XtreamAccountInfo {
  username: string
  status: string | null
  isTrial: boolean
  expiresAt: Date | null
  maxConnections: number | null
  activeConnections: number | null
}

function normalizeServer(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** Fetch account/expiry info via player_api.php (best-effort; never throws). */
export async function fetchXtreamAccount(
  serverUrl: string,
  username: string,
  password: string,
  timeoutMs = 30_000,
): Promise<XtreamAccountInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const api = `${normalizeServer(serverUrl)}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    const response = await fetch(api, { signal: controller.signal })
    if (!response.ok) return null
    const json = (await response.json()) as {
      user_info?: {
        username?: string
        status?: string
        is_trial?: string
        exp_date?: string
        max_connections?: string
        active_cons?: string
      }
    }
    const info = json.user_info
    if (!info) return null
    const expDate = info.exp_date ? new Date(Number.parseInt(info.exp_date, 10) * 1000) : null
    return {
      username: info.username ?? username,
      status: info.status ?? null,
      isTrial: info.is_trial === '1',
      expiresAt: expDate && !Number.isNaN(expDate.getTime()) ? expDate : null,
      maxConnections: info.max_connections ? Number.parseInt(info.max_connections, 10) : null,
      activeConnections: info.active_cons ? Number.parseInt(info.active_cons, 10) : null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Build the m3u_plus playlist URL for an Xtream account. */
export function xtreamPlaylistUrl(serverUrl: string, username: string, password: string): string {
  return `${normalizeServer(serverUrl)}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=m3u8`
}

interface XtreamLiveStream {
  num?: number
  name?: string
  stream_type?: string
  stream_id?: number
  stream_icon?: string | null
  category_id?: string | number
  tv_archive?: number
}

interface XtreamCategory {
  category_id?: string | number
  category_name?: string
}

async function fetchJson<T>(url: string, timeoutMs = 45_000): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fallback for panels that block get.php: build the channel list straight from
 * player_api (get_live_categories + get_live_streams) and construct live URLs.
 */
export async function fetchXtreamChannelsViaApi(
  serverUrl: string,
  username: string,
  password: string,
): Promise<ParsedChannel[]> {
  const base = normalizeServer(serverUrl)
  const cred = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`

  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(`${base}/player_api.php?${cred}&action=get_live_categories`),
    fetchJson<XtreamLiveStream[]>(`${base}/player_api.php?${cred}&action=get_live_streams`, 90_000),
  ])

  if (!Array.isArray(streams) || streams.length === 0) {
    throw new Error('player_api get_live_streams returned nothing (account may be expired or blocked)')
  }

  const catMap = new Map<string, string>()
  for (const category of categories ?? []) {
    if (category.category_id !== undefined && category.category_name) {
      catMap.set(String(category.category_id), category.category_name)
    }
  }

  return streams
    .filter((stream) => stream.stream_id && stream.name)
    .map((stream) => {
      const group = catMap.get(String(stream.category_id)) ?? null
      const haystack = `${stream.name} ${group ?? ''}`
      return {
        name: stream.name as string,
        url: `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${stream.stream_id}.m3u8`,
        logo: stream.stream_icon || null,
        group,
        tvgId: null,
        tvgCountry: null,
        language: null,
        category: detectCategory(haystack),
        country: null,
        countryName: null,
        quality: detectQuality(stream.name ?? '', '.m3u8'),
        isAdult: detectAdult(haystack),
      }
    })
}

/** Download + parse the Xtream playlist (get.php first, player_api fallback). */
export async function fetchXtreamChannels(
  serverUrl: string,
  username: string,
  password: string,
): Promise<ParsedChannel[]> {
  let entries: ParsedChannel[] = []
  let getPhpError: string | null = null

  try {
    const content = await fetchPlaylist(xtreamPlaylistUrl(serverUrl, username, password))
    entries = parseM3U(content)
  } catch (error) {
    getPhpError = error instanceof Error ? error.message : 'get.php failed'
  }

  if (entries.length === 0) {
    // Blocked / empty playlist → player_api route
    const apiEntries = await fetchXtreamChannelsViaApi(serverUrl, username, password)
    if (apiEntries.length === 0) {
      throw new Error(getPhpError ? `${getPhpError}; player_api also empty` : 'No channels found')
    }
    return apiEntries
  }
  return entries
}

/**
 * Quick VOD availability probe for the "Test" button: how many Movies and Series the
 * account exposes via player_api. Best-effort (0 on failure) — never throws.
 */
export async function fetchXtreamVodCounts(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ movies: number; series: number }> {
  const base = normalizeServer(serverUrl)
  const cred = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  const [vod, series] = await Promise.all([
    fetchJson<unknown[]>(`${base}/player_api.php?${cred}&action=get_vod_streams`, 90_000),
    fetchJson<unknown[]>(`${base}/player_api.php?${cred}&action=get_series`, 90_000),
  ])
  return {
    movies: Array.isArray(vod) ? vod.length : 0,
    series: Array.isArray(series) ? series.length : 0,
  }
}

export interface ParsedMovie {
  streamId: string
  title: string
  poster: string | null
  category: string | null
  rating: string | null
  year: string | null
  containerExt: string | null
}

/** Fetch the full Movies (VOD) catalog with category names resolved. */
export async function fetchXtreamVod(
  serverUrl: string,
  username: string,
  password: string,
): Promise<ParsedMovie[]> {
  const base = normalizeServer(serverUrl)
  const cred = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  const [cats, vod] = await Promise.all([
    fetchJson<XtreamCategory[]>(`${base}/player_api.php?${cred}&action=get_vod_categories`),
    fetchJson<Record<string, unknown>[]>(`${base}/player_api.php?${cred}&action=get_vod_streams`, 180_000),
  ])
  const catMap = new Map<string, string>()
  for (const c of cats ?? []) {
    if (c.category_id !== undefined && c.category_name) catMap.set(String(c.category_id), c.category_name)
  }
  if (!Array.isArray(vod)) return []
  const out: ParsedMovie[] = []
  for (const m of vod) {
    const streamId = m.stream_id
    const name = m.name
    if (streamId === undefined || streamId === null || !name) continue
    const year = m.year ?? m.releaseDate ?? m.releasedate ?? null
    out.push({
      streamId: String(streamId),
      title: String(name).trim(),
      poster: (m.stream_icon as string) || (m.cover as string) || null,
      category: m.category_id != null ? catMap.get(String(m.category_id)) ?? null : null,
      rating: m.rating != null ? String(m.rating) : null,
      year: year ? String(year).slice(0, 4) : null,
      containerExt: (m.container_extension as string) || null,
    })
  }
  return out
}

/** Derive the direct movie stream URL (server-side only; proxied + signed before the client). */
export function xtreamMovieUrl(serverUrl: string, username: string, password: string, streamId: string, ext: string | null): string {
  const base = normalizeServer(serverUrl)
  const e = (ext || 'mp4').replace(/^\./, '')
  return `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${streamId}.${e}`
}

/* --------------------------------- Series --------------------------------- */

export interface ParsedSeries {
  seriesId: string
  title: string
  poster: string | null
  category: string | null
  rating: string | null
  year: string | null
  plot: string | null
}

/** One episode of a series, normalized across the wildly different Xtream panels. */
export interface ParsedEpisode {
  id: string
  season: number
  episode: number
  title: string
  plot: string | null
  still: string | null
  durationSecs: number | null
  rating: string | null
  containerExt: string | null
}

export interface ParsedSeason {
  season: number
  name: string
  episodes: ParsedEpisode[]
}

/** Fetch the Series catalog (action=get_series) with category names resolved. */
export async function fetchXtreamSeries(
  serverUrl: string,
  username: string,
  password: string,
): Promise<ParsedSeries[]> {
  const base = normalizeServer(serverUrl)
  const cred = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  const [cats, series] = await Promise.all([
    fetchJson<XtreamCategory[]>(`${base}/player_api.php?${cred}&action=get_series_categories`),
    fetchJson<Record<string, unknown>[]>(`${base}/player_api.php?${cred}&action=get_series`, 180_000),
  ])
  const catMap = new Map<string, string>()
  for (const c of cats ?? []) {
    if (c.category_id !== undefined && c.category_name) catMap.set(String(c.category_id), c.category_name)
  }
  if (!Array.isArray(series)) return []
  const out: ParsedSeries[] = []
  for (const s of series) {
    const seriesId = s.series_id
    const name = s.name
    if (seriesId === undefined || seriesId === null || !name) continue
    const year = s.year ?? s.releaseDate ?? s.release_date ?? null
    const rating = s.rating ?? s.rating_5based ?? null
    out.push({
      seriesId: String(seriesId),
      title: String(name).trim(),
      poster: (s.cover as string) || (s.stream_icon as string) || null,
      category: s.category_id != null ? catMap.get(String(s.category_id)) ?? null : null,
      rating: rating != null ? String(rating) : null,
      year: year ? String(year).slice(0, 4) : null,
      plot: (s.plot as string) || null,
    })
  }
  return out
}

function toInt(value: unknown, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Fetch a series' episodes (action=get_series_info) and normalize them into seasons.
 * Panels encode `episodes` either as { "1": [...] } or as a flat array; both are handled.
 */
export async function fetchXtreamSeriesInfo(
  serverUrl: string,
  username: string,
  password: string,
  seriesId: string,
): Promise<{ seasons: ParsedSeason[]; plot: string | null; poster: string | null }> {
  const base = normalizeServer(serverUrl)
  const cred = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
  const json = await fetchJson<Record<string, unknown>>(
    `${base}/player_api.php?${cred}&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`,
    90_000,
  )
  const rawEpisodes = json?.episodes
  const buckets: { season: number; list: Record<string, unknown>[] }[] = []

  if (Array.isArray(rawEpisodes)) {
    buckets.push({ season: 1, list: rawEpisodes as Record<string, unknown>[] })
  } else if (rawEpisodes && typeof rawEpisodes === 'object') {
    for (const [key, value] of Object.entries(rawEpisodes as Record<string, unknown>)) {
      if (Array.isArray(value)) buckets.push({ season: toInt(key, 1), list: value as Record<string, unknown>[] })
    }
  }

  const seasons: ParsedSeason[] = buckets
    .map((bucket) => {
      const episodes: ParsedEpisode[] = bucket.list
        .filter((e) => e && typeof e === 'object')
        .map((e, index) => {
          const info = (e.info ?? {}) as Record<string, unknown>
          const duration = info.duration ?? e.duration
          const durationSecs = duration
            ? (() => {
                const parts = String(duration).split(':').map((p) => toInt(p, 0))
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
                return toInt(duration, 0) || null
              })()
            : null
          return {
            id: String(e.id ?? `${seriesId}-${bucket.season}-${index + 1}`),
            season: toInt(e.season, bucket.season),
            episode: toInt(e.episode_num ?? e.episode, index + 1),
            title: String(e.title || info.name || `Episode ${index + 1}`).trim(),
            plot: (info.plot as string) || (e.plot as string) || null,
            still: (info.movie_image as string) || (e.movie_image as string) || null,
            durationSecs,
            rating: info.rating != null ? String(info.rating) : null,
            containerExt: (e.container_extension as string) || null,
          }
        })
        .sort((a, b) => a.episode - b.episode)
      return { season: bucket.season, name: `Season ${bucket.season}`, episodes }
    })
    .filter((s) => s.episodes.length > 0)
    .sort((a, b) => a.season - b.season)

  const info = (json?.info ?? {}) as Record<string, unknown>
  return {
    seasons,
    plot: (info.plot as string) || null,
    poster: (info.cover as string) || (info.movie_image as string) || null,
  }
}

/** Direct episode stream URL (server-side only — always proxied + signed before the client). */
export function xtreamSeriesEpisodeUrl(
  serverUrl: string,
  username: string,
  password: string,
  episodeId: string,
  ext: string | null,
): string {
  const base = normalizeServer(serverUrl)
  const e = (ext || 'mp4').replace(/^\./, '')
  return `${base}/series/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${encodeURIComponent(episodeId)}.${e}`
}
