/**
 * VOD (Movies) sync for Xtream portals. Imports get_vod_streams into the Movie table,
 * mirroring the channel sync: stable sourceId per (portal, streamId), batched inserts,
 * dedupe within the run, deactivate what disappeared. Series come later.
 *
 * The movie play URL is NOT stored — it's derived at serve time from the portal creds, so
 * credentials never fan out across 65k rows and rotate cleanly (see xtreamMovieUrl).
 */
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/server/crypto'
import { channelIdentityKey } from '@/lib/server/iptv'
import { detectAdult, detectCategory } from './m3u'
import { fetchXtreamVod, type ParsedMovie } from './xtream'

function movieSourceId(portalId: string, streamId: string): string {
  return `portal:${portalId}:vod:${streamId}`
}

export interface VodSyncResult {
  portalId: string
  added: number
  updated: number
  removed: number
  total: number
  durationMs: number
}

export async function syncPortalMovies(portalId: string): Promise<VodSyncResult> {
  const startedAt = Date.now()
  const portal = await db.portal.findUnique({ where: { id: portalId } })
  if (!portal) throw new Error('Source not found')
  if (portal.type !== 'XTREAM') throw new Error('Movies sync sirf Xtream sources ke liye hai')
  const password = decryptSecret(portal.password)
  if (!portal.url || !portal.username || !password) throw new Error('Xtream server/username/password missing')

  const movies = await fetchXtreamVod(portal.url, portal.username, password)
  if (movies.length === 0) {
    return { portalId, added: 0, updated: 0, removed: 0, total: 0, durationMs: Date.now() - startedAt }
  }

  const existing = await db.movie.findMany({
    where: { portalId },
    select: { id: true, sourceId: true, title: true, poster: true, isActive: true },
  })
  const existingBySource = new Map(existing.map((m) => [m.sourceId, m]))

  const seen = new Set<string>()
  const queued = new Set<string>()
  const toCreate: ParsedMovie[] = []
  const toUpdate: { id: string; movie: ParsedMovie }[] = []

  for (const m of movies) {
    const sourceId = movieSourceId(portalId, m.streamId)
    seen.add(sourceId)
    const match = existingBySource.get(sourceId)
    if (!match) {
      if (queued.has(sourceId)) continue
      queued.add(sourceId)
      toCreate.push(m)
      continue
    }
    if (match.title !== m.title || match.poster !== m.poster || !match.isActive) toUpdate.push({ id: match.id, movie: m })
  }

  const CHUNK = 500
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const rows = toCreate.slice(i, i + CHUNK).map((m) => {
      const cat = detectCategory(`${m.title} ${m.category ?? ''}`)
      return {
        organizationId: portal.organizationId,
        portalId,
        sourceId: movieSourceId(portalId, m.streamId),
        streamId: m.streamId,
        title: m.title,
        identityKey: channelIdentityKey(m.title),
        poster: m.poster,
        year: m.year,
        rating: m.rating,
        genre: m.category,
        categories: cat ? `|${cat}|` : '|movies|',
        containerExt: m.containerExt,
        isNsfw: detectAdult(`${m.title} ${m.category ?? ''}`),
      }
    })
    await db.movie.createMany({ data: rows, skipDuplicates: true })
  }

  for (const { id, movie } of toUpdate) {
    await db.movie.update({
      where: { id },
      data: { title: movie.title, identityKey: channelIdentityKey(movie.title), poster: movie.poster, year: movie.year, rating: movie.rating, isActive: true },
    })
  }

  const missing = existing.filter((m) => !seen.has(m.sourceId) && m.isActive).map((m) => m.id)
  if (missing.length > 0) await db.movie.updateMany({ where: { id: { in: missing } }, data: { isActive: false } })

  return {
    portalId,
    added: toCreate.length,
    updated: toUpdate.length,
    removed: missing.length,
    total: movies.length,
    durationMs: Date.now() - startedAt,
  }
}

/** Build the signed-proxy-ready movie URL for a specific movie (server-side; creds hidden after). */
export async function movieStreamUrl(movieId: string, organizationId: string): Promise<{ url: string; ua: string | null; ref: string | null } | null> {
  const movie = await db.movie.findFirst({
    where: { id: movieId, organizationId },
    select: { streamId: true, containerExt: true, portal: { select: { url: true, username: true, password: true } } },
  })
  if (!movie?.portal?.url || !movie.portal.username) return null
  const password = decryptSecret(movie.portal.password)
  if (!password) return null
  const { xtreamMovieUrl } = await import('./xtream')
  return { url: xtreamMovieUrl(movie.portal.url, movie.portal.username, password, movie.streamId, movie.containerExt), ua: null, ref: null }
}
