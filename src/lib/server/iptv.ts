import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { signedProxyPath } from '@/lib/server/proxy-sign'

/* ---------------------------------- Types --------------------------------- */

export const STREAM_SELECT = {
  id: true,
  url: true,
  quality: true,
  title: true,
  referrer: true,
  userAgent: true,
  status: true,
  priority: true,
  failureCount: true,
  lastOkAt: true,
  lastFailureAt: true,
  lastProbeAt: true,
  latencyMs: true,
} satisfies Prisma.StreamSelect

/** Consecutive playback failures before a stream is auto-disabled (health-aware failover). */
export const FAILURE_THRESHOLD = 5

export type StreamSelection = Prisma.StreamGetPayload<{ select: typeof STREAM_SELECT }>

export type ChannelWithStreams = Prisma.ChannelGetPayload<{
  include: { streams: { select: typeof STREAM_SELECT } }
}>

export interface BestStream {
  id: string
  url: string
  quality: string | null
  title: string | null
  referrer: string | null
  userAgent: string | null
}

export interface ChannelItem {
  id: string
  sourceId: string
  name: string
  network: string | null
  logo: string | null
  country: string | null
  countryName: string | null
  countryFlag: string | null
  /** Category slugs parsed from the pipe-delimited column, e.g. |news|movies| */
  categories: string[]
  /** Language display names parsed from the pipe-delimited column, e.g. |Hindi|English| */
  languages: string[]
  website: string | null
  isNsfw: boolean
  streamCount: number
  bestStream: BestStream | null
}

export interface ChannelDetail extends ChannelItem {
  streams: Array<{
    id: string
    title: string | null
    url: string
    quality: string | null
    referrer: string | null
    userAgent: string | null
  }>
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type ChannelSort = 'name' | 'nameDesc'

export interface ListChannelsOptions {
  search?: string
  country?: string[]
  category?: string[]
  language?: string[]
  /** when false (default) NSFW channels are excluded */
  nsfw?: boolean
  page?: number
  pageSize?: number
  sort?: ChannelSort
}

/* -------------------------------- Helpers --------------------------------- */

/** Split a pipe-delimited DB column ("|news|movies|") into ["news","movies"]. */
export function splitPipe(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/**
 * Normalised identity for a channel, used to group the SAME logical channel across
 * different portals (Xtream / M3U / Stalker) so playback can fail over between every
 * source that carries it. e.g. "Zee Marathi HD", "MAR: Zee Marathi", "Zee Marathi FHD"
 * all collapse to `zee marathi`.
 *
 * Deliberately conservative — it strips a leading country/language code, quality/format
 * tags and bracketed notes, but keeps distinguishing words (News, Hindi) and digits
 * (Star Sports 1 vs 2) so genuinely different channels never merge.
 */
const QUALITY_TOKENS = new Set([
  'hd', 'fhd', 'uhd', 'sd', 'shd', '4k', '8k', '2160p', '1440p', '1080p', '720p', '576p', '480p',
  'hevc', 'h265', 'h264', 'x265', 'x264', 'raw', 'backup', 'bkp', 'alt',
])

export function channelIdentityKey(name: string | null | undefined): string {
  if (!name) return ''
  let s = name.toLowerCase()
  s = s.replace(/[\[(][^\])]*[\])]/g, ' ') // drop (…) and […] notes
  s = s.replace(/^\s*[\[(]?[a-z]{2,3}[\])]?\s*[:|\-]\s*/, ' ') // leading "IN:" / "MAR |" / "us -"
  s = s.replace(/[^a-z0-9]+/g, ' ').trim() // keep alphanumerics + spaces
  const kept = s.split(' ').filter((w) => w && !QUALITY_TOKENS.has(w))
  // Never return empty (e.g. a name that was ALL quality tokens) — fall back to the raw
  // name so such channels never all collapse into one bogus group.
  return kept.join(' ') || name.toLowerCase().trim()
}

/** Parse a numeric resolution out of a quality string like "1080p" -> 1080. */
export function qualityRank(quality: string | null | undefined): number {
  if (!quality) return -1
  const match = quality.match(/(\d+)/)
  return match ? Number.parseInt(match[1], 10) : 0
}

function isHlsUrl(url: string): boolean {
  return url.includes('m3u8')
}

interface StreamHealth {
  status?: string
  priority?: number
  failureCount?: number
  lastOkAt?: Date | null
  lastFailureAt?: Date | null
}

/**
 * Canonical stream ordering — the player consumes this order and fails over top-to-bottom.
 *
 * This is the "no one should have to pick a server" rule, in priority order:
 *   1. healthy (ACTIVE) before auto-disabled
 *   2. a source that recently played beats one that has been failing (`failureCount`)
 *   3. lower `priority` first (operator can still pin a favourite)
 *   4. HLS, then higher parsed quality, then streams that carry a quality label
 *
 * Because the health doctor keeps `failureCount` / `lastOkAt` fresh, the first source a
 * customer gets is almost always one that actually worked recently — across every portal
 * (M3U / Xtream / Stalker) that carries the channel.
 */
export function sortStreams<T extends { url: string; quality: string | null } & StreamHealth>(streams: T[]): T[] {
  return [...streams].sort((a, b) => {
    const aDead = a.status === 'DISABLED' ? 1 : 0
    const bDead = b.status === 'DISABLED' ? 1 : 0
    if (aDead !== bDead) return aDead - bDead

    // Recent success is the strongest signal we have; a never-played source counts as 0.
    const aOk = a.lastOkAt ? new Date(a.lastOkAt).getTime() : 0
    const bOk = b.lastOkAt ? new Date(b.lastOkAt).getTime() : 0
    const aRecent = aOk > Date.now() - 24 * 60 * 60 * 1000 ? 1 : 0
    const bRecent = bOk > Date.now() - 24 * 60 * 60 * 1000 ? 1 : 0
    if (aRecent !== bRecent) return bRecent - aRecent
    const af = a.failureCount ?? 0
    const bf = b.failureCount ?? 0
    if (af !== bf) return af - bf

    const pa = a.priority ?? 100
    const pb = b.priority ?? 100
    if (pa !== pb) return pa - pb
    const aHls = isHlsUrl(a.url) ? 1 : 0
    const bHls = isHlsUrl(b.url) ? 1 : 0
    if (aHls !== bHls) return bHls - aHls
    const qa = qualityRank(a.quality)
    const qb = qualityRank(b.quality)
    if (qa !== qb) return qb - qa
    const aHas = a.quality ? 1 : 0
    const bHas = b.quality ? 1 : 0
    return bHas - aHas
  })
}

/** Streams a customer should actually get: healthy first; disabled ones only if nothing else is left. */
function servableStreams(streams: StreamSelection[]): StreamSelection[] {
  const healthy = streams.filter((s) => s.status !== 'DISABLED')
  return healthy.length > 0 ? healthy : streams
}

export function pickBestStream(streams: StreamSelection[]): BestStream | null {
  const sorted = sortStreams(servableStreams(streams))
  const best = sorted[0]
  if (!best) return null
  return {
    id: best.id,
    // Signed same-origin proxy path — the raw upstream URL (which for Xtream
    // sources embeds username/password) is never sent to the client.
    url: signedProxyPath(best.url, best.userAgent, best.referrer),
    quality: best.quality,
    title: best.title,
    referrer: null,
    userAgent: null,
  }
}

/** Cap on how many sources we ever aggregate for one logical channel (guards a generic name). */
export const MAX_AGGREGATED_SOURCES = 30

/** Merge stream groups (opened channel first), dropping duplicate upstream URLs and capping. */
export function dedupeStreamsByUrl(groups: StreamSelection[][], cap = MAX_AGGREGATED_SOURCES): StreamSelection[] {
  const seen = new Set<string>()
  const out: StreamSelection[] = []
  for (const group of groups) {
    for (const s of group) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      out.push(s)
      if (out.length >= cap) return out
    }
  }
  return out
}

/**
 * Pick the row that best represents a group of same-channel rows (across portals) for a
 * catalog card: prefer one that has a logo and richer metadata, then more streams.
 */
export function pickRepresentative<
  T extends { logo: string | null; categories: string; languages: string; streams: { id: string }[] }
>(members: T[]): T {
  return [...members].sort((a, b) => {
    const al = a.logo ? 1 : 0
    const bl = b.logo ? 1 : 0
    if (al !== bl) return bl - al
    const am = (a.categories.length > 1 ? 1 : 0) + (a.languages.length > 1 ? 1 : 0)
    const bm = (b.categories.length > 1 ? 1 : 0) + (b.languages.length > 1 ? 1 : 0)
    if (am !== bm) return bm - am
    return b.streams.length - a.streams.length
  })[0]
}

/** Map DB streams to client stream rows with signed proxy URLs (used by the detail view). */
export function toStreamInfo(streams: StreamSelection[]) {
  return sortStreams(servableStreams(streams)).map((stream) => ({
    id: stream.id,
    title: stream.title,
    url: signedProxyPath(stream.url, stream.userAgent, stream.referrer),
    quality: stream.quality,
    referrer: null,
    userAgent: null,
  }))
}

export function toChannelItem(channel: ChannelWithStreams): ChannelItem {
  return {
    id: channel.id,
    sourceId: channel.sourceId,
    name: channel.name,
    network: channel.network,
    logo: channel.logo,
    country: channel.country,
    countryName: channel.countryName,
    countryFlag: channel.countryFlag,
    categories: splitPipe(channel.categories),
    languages: splitPipe(channel.languages),
    website: channel.website,
    isNsfw: channel.isNsfw,
    streamCount: channel.streams.length,
    bestStream: pickBestStream(channel.streams),
  }
}

/* ------------------------------ Query building ----------------------------- */

/**
 * Validity guard applied to EVERY public/customer query:
 * channels synced from a portal are only servable while the portal itself is
 * active, successfully synced (ACTIVE or mid-refresh SYNCING), and not past
 * its expiresAt. Dead (ERROR), pending, switched-off (INACTIVE) or expired
 * sources therefore never leak their channels — "validity ke hisab se".
 */
export function portalValidityClause(now: Date = new Date()): Prisma.ChannelWhereInput {
  return {
    OR: [
      { portalId: null },
      {
        portal: {
          isActive: true,
          status: { in: ['ACTIVE', 'SYNCING'] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
    ],
  }
}

/**
 * A channel is only shown to customers while it still has at least one WORKING (non-DISABLED)
 * source. When the operator disables every source (or they all auto-disable after repeated
 * failures) the channel is effectively off and must disappear from the customer catalog —
 * not linger playing a dead stream.
 */
export function servableChannelClause(): Prisma.ChannelWhereInput {
  return { streams: { some: { status: { not: 'DISABLED' } } } }
}

export function buildChannelWhere(
  opts: Pick<ListChannelsOptions, 'search' | 'country' | 'category' | 'language' | 'nsfw'>,
  organizationId: string,
): Prisma.ChannelWhereInput {
  const where: Prisma.ChannelWhereInput = {}
  where.organizationId = organizationId // tenant scope — every channel query is org-bound
  where.isActive = true // portal syncs deactivate dead channels; never serve them publicly
  // Each active filter group narrows the result (AND); options WITHIN a group widen it (OR).
  // So "Hindi" + "Movies" = Hindi AND Movies channels, while "Movies" + "News" = either category.
  const and: Prisma.ChannelWhereInput[] = [portalValidityClause(), servableChannelClause()] // hide expired/dead/off sources
  if (!opts.nsfw) where.isNsfw = false
  if (opts.country && opts.country.length > 0) {
    where.country = { in: opts.country }
  }
  if (opts.category && opts.category.length > 0) {
    and.push({ OR: opts.category.map((slug) => ({ categories: { contains: `|${slug}|` } })) })
  }
  if (opts.language && opts.language.length > 0) {
    and.push({ OR: opts.language.map((lang) => ({ languages: { contains: `|${lang}|` } })) })
  }
  where.AND = and
  // MySQL LIKE is case-insensitive under the default collation, so `contains` matches loosely.
  if (opts.search) where.name = { contains: opts.search }
  return where
}

function csvParam(searchParams: URLSearchParams, key: string): string[] {
  const raw = searchParams.get(key)
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

/** Parse + normalize list query params from a URL's search params. */
export function parseListParams(searchParams: URLSearchParams): ListChannelsOptions & {
  page: number
  pageSize: number
  sort: ChannelSort
} {
  const search = searchParams.get('search')?.trim() || undefined
  const country = csvParam(searchParams, 'country')
  const category = csvParam(searchParams, 'category')
  const language = csvParam(searchParams, 'language')
  const nsfw = searchParams.get('nsfw') === 'true'

  let page = Number.parseInt(searchParams.get('page') ?? '', 10)
  if (!Number.isFinite(page) || page < 1) page = 1

  let pageSize = Number.parseInt(searchParams.get('pageSize') ?? '', 10)
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 24
  if (pageSize > 100) pageSize = 100

  const sort: ChannelSort = searchParams.get('sort') === 'nameDesc' ? 'nameDesc' : 'name'

  return { search, country, category, language, nsfw, page, pageSize, sort }
}

/* ------------------------------ Core list query ---------------------------- */

export async function listChannels(opts: ListChannelsOptions, organizationId: string): Promise<Paged<ChannelItem>> {
  const page = opts.page && opts.page >= 1 ? Math.floor(opts.page) : 1
  const pageSize = opts.pageSize && opts.pageSize >= 1 ? Math.min(Math.floor(opts.pageSize), 100) : 24
  const sort: ChannelSort = opts.sort === 'nameDesc' ? 'nameDesc' : 'name'

  const where = buildChannelWhere(opts, organizationId)
  const orderBy: Prisma.ChannelOrderByWithRelationInput = { name: sort === 'nameDesc' ? 'desc' : 'asc' }

  const [total, channels] = await Promise.all([
    db.channel.count({ where }),
    db.channel.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { streams: { select: STREAM_SELECT } },
    }),
  ])

  return {
    items: channels.map(toChannelItem),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}
