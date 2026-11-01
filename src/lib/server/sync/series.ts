/**
 * TV Series sync for Xtream portals.
 *
 * Same shape as the Movies pipeline (vod.ts), with one important difference: a series'
 * episode list is a *second* round-trip per title (get_series_info), and some panels hold
 * 40+ seasons. Downloading that for every series during a sync would take hours, so
 * episodes are fetched **lazily on first open** and cached in `Series.episodesJson`
 * (refreshed when the cache is older than EPISODE_CACHE_MS).
 *
 * Episode stream URLs are never stored — they're derived at serve time from the portal's
 * credentials and handed to the client only as an opaque signed `/api/proxy` token.
 */
import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/server/crypto'
import { channelIdentityKey } from '@/lib/server/iptv'
import { detectAdult, detectCategory } from './m3u'
import { fetchXtreamSeries, fetchXtreamSeriesInfo, xtreamSeriesEpisodeUrl, type ParsedSeason } from './xtream'

/** Episodes drift slowly (a running show adds episodes weekly) — a day of cache is plenty. */
const EPISODE_CACHE_MS = 24 * 60 * 60 * 1000

function seriesSourceId(portalId: string, seriesId: string): string {
  return `portal:${portalId}:series:${seriesId}`
}

export interface SeriesSyncResult {
  portalId: string
  added: number
  updated: number
  removed: number
  total: number
  durationMs: number
}

async function portalCredentials(portalId: string) {
  const portal = await db.portal.findUnique({ where: { id: portalId } })
  if (!portal) throw new Error('Source not found')
  if (portal.type !== 'XTREAM') throw new Error('Series sync sirf Xtream sources ke liye hai')
  const password = decryptSecret(portal.password)
  if (!portal.url || !portal.username || !password) throw new Error('Xtream server/username/password missing')
  return { portal, password }
}

export async function syncPortalSeries(portalId: string): Promise<SeriesSyncResult> {
  const startedAt = Date.now()
  const { portal, password } = await portalCredentials(portalId)
  const series = await fetchXtreamSeries(portal.url!, portal.username!, password)
  if (series.length === 0) {
    return { portalId, added: 0, updated: 0, removed: 0, total: 0, durationMs: Date.now() - startedAt }
  }

  const existing = await db.series.findMany({
    where: { portalId },
    select: { id: true, sourceId: true, title: true, poster: true, isActive: true },
  })
  const existingBySource = new Map(existing.map((s) => [s.sourceId, s]))

  const seen = new Set<string>()
  const queued = new Set<string>()
  const toCreate: (typeof series)[number][] = []
  const toUpdate: { id: string; s: (typeof series)[number] }[] = []

  for (const s of series) {
    const sourceId = seriesSourceId(portalId, s.seriesId)
    seen.add(sourceId)
    const match = existingBySource.get(sourceId)
    if (!match) {
      if (queued.has(sourceId)) continue
      queued.add(sourceId)
      toCreate.push(s)
      continue
    }
    if (match.title !== s.title || match.poster !== s.poster || !match.isActive) toUpdate.push({ id: match.id, s })
  }

  const CHUNK = 500
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const rows = toCreate.slice(i, i + CHUNK).map((s) => {
      const cat = detectCategory(`${s.title} ${s.category ?? ''}`)
      return {
        organizationId: portal.organizationId,
        portalId,
        sourceId: seriesSourceId(portalId, s.seriesId),
        seriesId: s.seriesId,
        title: s.title,
        identityKey: channelIdentityKey(s.title),
        poster: s.poster,
        plot: s.plot,
        year: s.year,
        rating: s.rating,
        genre: s.category,
        categories: cat ? `|${cat}|` : '|series|',
        isNsfw: detectAdult(`${s.title} ${s.category ?? ''}`),
      }
    })
    await db.series.createMany({ data: rows, skipDuplicates: true })
  }

  for (const { id, s } of toUpdate) {
    await db.series.update({
      where: { id },
      data: { title: s.title, identityKey: channelIdentityKey(s.title), poster: s.poster, year: s.year, rating: s.rating, isActive: true },
    })
  }

  const missing = existing.filter((s) => !seen.has(s.sourceId) && s.isActive).map((s) => s.id)
  if (missing.length > 0) await db.series.updateMany({ where: { id: { in: missing } }, data: { isActive: false } })

  return {
    portalId,
    added: toCreate.length,
    updated: toUpdate.length,
    removed: missing.length,
    total: series.length,
    durationMs: Date.now() - startedAt,
  }
}

interface CachedEpisodes {
  seasons: ParsedSeason[]
  fetchedAt: number
}

/** Parse `Series.episodesJson`, tolerating both the v2 shape and the bare seasons array. */
function parseEpisodes(json: string | null): CachedEpisodes | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as Partial<CachedEpisodes> | ParsedSeason[]
    if (Array.isArray(parsed)) return { seasons: parsed, fetchedAt: 0 }
    if (!Array.isArray(parsed.seasons)) return null
    return { seasons: parsed.seasons, fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0 }
  } catch {
    return null
  }
}

export interface SeriesDetail {
  id: string
  title: string
  poster: string | null
  plot: string | null
  year: string | null
  rating: string | null
  genre: string | null
  seasons: {
    season: number
    name: string
    episodes: {
      id: string
      season: number
      episode: number
      title: string
      plot: string | null
      still: string | null
      durationSecs: number | null
      rating: string | null
    }[]
  }[]
}

/**
 * Series detail with seasons/episodes, lazily populated from the panel on first open
 * (and refreshed once a day). Falls back to whatever is cached when the panel is down,
 * so an outage degrades to "slightly stale episodes" instead of a blank screen.
 */
export async function seriesWithEpisodes(seriesId: string, organizationId: string, force = false): Promise<SeriesDetail | null> {
  const series = await db.series.findFirst({
    where: { id: seriesId, organizationId, isActive: true, isNsfw: false },
    select: {
      id: true,
      title: true,
      poster: true,
      plot: true,
      year: true,
      rating: true,
      genre: true,
      seriesId: true,
      portalId: true,
      episodesJson: true,
      episodesAt: true,
    },
  })
  if (!series) return null

  let cached = parseEpisodes(series.episodesJson)
  const stale = !cached || force || !cached.fetchedAt || Date.now() - cached.fetchedAt > EPISODE_CACHE_MS

  if (stale && series.portalId) {
    try {
      const { portal, password } = await portalCredentials(series.portalId)
      const info = await fetchXtreamSeriesInfo(portal.url!, portal.username!, password, series.seriesId)
      if (info.seasons.length > 0) {
        cached = { seasons: info.seasons, fetchedAt: Date.now() }
        await db.series.update({
          where: { id: series.id },
          data: {
            episodesJson: JSON.stringify(cached),
            episodesAt: new Date(),
            ...(info.plot && !series.plot ? { plot: info.plot } : {}),
            ...(info.poster && !series.poster ? { poster: info.poster } : {}),
          },
        })
      }
    } catch {
      // panel unreachable — serve the cache we have (possibly empty) instead of failing
    }
  }

  return {
    id: series.id,
    title: series.title,
    poster: series.poster,
    plot: series.plot,
    year: series.year,
    rating: series.rating,
    genre: series.genre,
    seasons: (cached?.seasons ?? []).map((s) => ({
      season: s.season,
      name: s.name,
      episodes: s.episodes.map((e) => ({
        id: e.id,
        season: e.season,
        episode: e.episode,
        title: e.title,
        plot: e.plot,
        still: e.still,
        durationSecs: e.durationSecs,
        rating: e.rating,
      })),
    })),
  }
}

/** Resolve one episode (season + episode number) into a raw upstream URL. Server-side only. */
export async function episodeStreamUrl(
  seriesId: string,
  organizationId: string,
  season: number,
  episode: number,
): Promise<{ url: string; title: string; durationSecs: number | null } | null> {
  const detail = await seriesWithEpisodes(seriesId, organizationId)
  const bucket = detail?.seasons.find((s) => s.season === season) ?? null
  const found = bucket?.episodes.find((e) => e.episode === episode) ?? null
  if (!detail || !found) return null

  const row = await db.series.findFirst({
    where: { id: seriesId, organizationId },
    select: { portalId: true, seriesId: true, portal: { select: { url: true, username: true, password: true } } },
  })
  const portal = row?.portal
  if (!portal?.url || !portal.username) return null
  const password = decryptSecret(portal.password)
  if (!password) return null

  const ext = await episodeContainerExt(seriesId, organizationId, season, episode)
  return {
    url: xtreamSeriesEpisodeUrl(portal.url, portal.username, password, found.id, ext),
    title: `${detail.title} · S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')} — ${found.title}`,
    durationSecs: found.durationSecs,
  }
}

/** Container extension lives in the cached JSON, not in its own column. */
async function episodeContainerExt(seriesId: string, organizationId: string, season: number, episode: number): Promise<string | null> {
  const row = await db.series.findFirst({
    where: { id: seriesId, organizationId },
    select: { episodesJson: true },
  })
  const cached = parseEpisodes(row?.episodesJson ?? null)
  const found = cached?.seasons
    .find((s) => s.season === season)
    ?.episodes.find((e) => e.episode === episode)
  return (found as { containerExt?: string | null } | undefined)?.containerExt ?? null
}
