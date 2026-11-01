import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { FAILURE_THRESHOLD, channelIdentityKey, pickRepresentative } from '@/lib/server/iptv'
import { signedProxyPath } from '@/lib/server/proxy-sign'

/**
 * Shared multi-source failover logic used by BOTH the single-operator admin console
 * (/api/admin/*) and the multi-tenant platform console (/api/platform/*). Everything is
 * org-scoped: pass the organizationId (or undefined on the platform to span every org).
 *
 * A "source" is a Stream row; a logical channel's sources span every portal channel row
 * that shares its identityKey — that's the chain the player fails over between.
 */

export type HealthFilter = 'all' | 'working' | 'nobackup' | 'failed'

const PORTAL_TYPE_LABEL: Record<string, string> = {
  STALKER: 'Stalker',
  XTREAM: 'Xtream',
  M3U_URL: 'M3U',
  M3U_FILE: 'M3U file',
}

const PAGE_SIZE = 25

export interface FailoverListResult {
  items: {
    id: string
    identityKey: string
    name: string
    logo: string | null
    totalSources: number
    workingSources: number
    health: 'working' | 'degraded' | 'nobackup' | 'failed'
  }[]
  stats: { total: number; working: number; nobackup: number; failed: number }
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export async function listFailoverChannels(
  organizationId: string | undefined,
  opts: { search?: string; filter?: HealthFilter; page?: number },
): Promise<FailoverListResult> {
  const search = opts.search?.trim() || ''
  const filter = opts.filter ?? 'all'
  let page = opts.page ?? 1
  if (!Number.isFinite(page) || page < 1) page = 1

  const orgSql = organizationId ? Prisma.sql`AND c.organizationId = ${organizationId}` : Prisma.empty
  const searchSql = search ? Prisma.sql`AND c.name LIKE ${`%${search}%`}` : Prisma.empty
  const baseWhere = Prisma.sql`WHERE c.isActive = 1 AND c.identityKey IS NOT NULL ${orgSql} ${searchSql}`

  const grouped = Prisma.sql`
    SELECT c.identityKey AS ik,
           COUNT(s.id) AS t,
           SUM(CASE WHEN s.status = 'ACTIVE' THEN 1 ELSE 0 END) AS w
    FROM Channel c
    LEFT JOIN Stream s ON s.channelId = c.id
    ${baseWhere}
    GROUP BY c.identityKey
  `

  const statsRows = await db.$queryRaw<{ total: bigint; working: bigint; nobackup: bigint; failed: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN w > 0 THEN 1 ELSE 0 END) AS working,
           SUM(CASE WHEN t = 1 AND w > 0 THEN 1 ELSE 0 END) AS nobackup,
           SUM(CASE WHEN w = 0 THEN 1 ELSE 0 END) AS failed
    FROM ( ${grouped} ) g
  `)
  const sr = statsRows[0] ?? { total: BigInt(0), working: BigInt(0), nobackup: BigInt(0), failed: BigInt(0) }
  const stats = {
    total: Number(sr.total),
    working: Number(sr.working),
    nobackup: Number(sr.nobackup),
    failed: Number(sr.failed),
  }

  const having =
    filter === 'working' ? Prisma.sql`HAVING w > 0`
    : filter === 'nobackup' ? Prisma.sql`HAVING t = 1 AND w > 0`
    : filter === 'failed' ? Prisma.sql`HAVING w = 0`
    : Prisma.empty
  const total = filter === 'working' ? stats.working : filter === 'nobackup' ? stats.nobackup : filter === 'failed' ? stats.failed : stats.total

  const rows = await db.$queryRaw<{ ik: string; t: bigint; w: bigint }[]>(Prisma.sql`
    SELECT c.identityKey AS ik,
           COUNT(s.id) AS t,
           SUM(CASE WHEN s.status = 'ACTIVE' THEN 1 ELSE 0 END) AS w
    FROM Channel c
    LEFT JOIN Stream s ON s.channelId = c.id
    ${baseWhere}
    GROUP BY c.identityKey
    ${having}
    ORDER BY MIN(c.name) ASC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `)

  const keys = rows.map((r) => r.ik)
  const members = keys.length
    ? await db.channel.findMany({
        where: { ...(organizationId ? { organizationId } : {}), isActive: true, identityKey: { in: keys } },
        select: { id: true, name: true, logo: true, categories: true, languages: true, identityKey: true, streams: { select: { id: true } } },
      })
    : []
  const byKey = new Map<string, typeof members>()
  for (const m of members) {
    const k = m.identityKey as string
    const arr = byKey.get(k)
    if (arr) arr.push(m)
    else byKey.set(k, [m])
  }

  const items = rows
    .map((r) => {
      const group = byKey.get(r.ik) ?? []
      const rep = group.length ? pickRepresentative(group) : null
      if (!rep) return null
      const t = Number(r.t)
      const w = Number(r.w)
      return {
        id: rep.id,
        identityKey: r.ik,
        name: rep.name,
        logo: rep.logo,
        totalSources: t,
        workingSources: w,
        health: (w === 0 ? 'failed' : w < t ? 'degraded' : t === 1 ? 'nobackup' : 'working') as
          | 'working'
          | 'degraded'
          | 'nobackup'
          | 'failed',
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return { items, stats, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

export interface ChannelSourcesResult {
  channel: { id: string; name: string; identityKey: string }
  sources: {
    streamId: string
    channelId: string
    channelName: string
    provider: string
    providerType: string | null
    manual: boolean
    quality: string | null
    title: string | null
    priority: number
    status: string
    failureCount: number
    lastError: string | null
    lastFailureAt: Date | null
    lastOkAt: Date | null
    /** Signed same-origin proxy URL to preview this exact source in a player (creds hidden). */
    previewUrl: string
  }[]
  total: number
  working: number
}

/** All sources for the logical channel that `channelId` belongs to (aggregated across portals). */
export async function getChannelSources(
  organizationId: string | undefined,
  channelId: string,
): Promise<ChannelSourcesResult | null> {
  const channel = await db.channel.findFirst({
    where: { id: channelId, ...(organizationId ? { organizationId } : {}) },
    select: { id: true, name: true, identityKey: true, organizationId: true },
  })
  if (!channel) return null

  const key = channel.identityKey ?? channelIdentityKey(channel.name)
  const rows = await db.channel.findMany({
    where: { organizationId: channel.organizationId, isActive: true, identityKey: key },
    select: {
      id: true,
      name: true,
      portal: { select: { name: true, type: true } },
      streams: {
        select: {
          id: true, title: true, quality: true, priority: true, status: true,
          failureCount: true, lastError: true, lastFailureAt: true, lastOkAt: true, portalId: true,
          url: true, userAgent: true, referrer: true,
          portal: { select: { name: true, type: true } },
        },
      },
    },
  })

  const sources: ChannelSourcesResult['sources'] = []
  for (const row of rows) {
    for (const st of row.streams) {
      const p = st.portal ?? row.portal
      sources.push({
        streamId: st.id,
        channelId: row.id,
        channelName: row.name,
        provider: p?.name ?? 'Manual / added',
        providerType: p ? PORTAL_TYPE_LABEL[p.type] ?? p.type : null,
        manual: st.portalId === null && !row.portal,
        quality: st.quality,
        title: st.title,
        priority: st.priority,
        status: st.status,
        failureCount: st.failureCount,
        lastError: st.lastError,
        lastFailureAt: st.lastFailureAt,
        lastOkAt: st.lastOkAt,
        previewUrl: signedProxyPath(st.url, st.userAgent, st.referrer),
      })
    }
  }
  sources.sort((a, b) => {
    const ad = a.status === 'DISABLED' ? 1 : 0
    const bd = b.status === 'DISABLED' ? 1 : 0
    if (ad !== bd) return ad - bd
    if (a.priority !== b.priority) return a.priority - b.priority
    return (b.lastOkAt?.getTime() ?? 0) - (a.lastOkAt?.getTime() ?? 0)
  })

  return {
    channel: { id: channel.id, name: channel.name, identityKey: key },
    sources,
    total: sources.length,
    working: sources.filter((s) => s.status !== 'DISABLED').length,
  }
}

const PROBE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const PROBE_TIMEOUT_MS = 12_000

function isPrivate(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h || h === 'localhost' || h === '0.0.0.0' || h === '::1') return true
  if (h.endsWith('.local') || h.endsWith('.internal')) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
  }
  return false
}

export interface ProbeResult { ok: boolean; detail: string; status: string; failureCount: number }

/** Live-probe one source and record the result (org-scoped). Returns null if not found. */
export async function probeStream(
  organizationId: string | undefined,
  channelId: string,
  streamId: string,
): Promise<ProbeResult | null> {
  const stream = await db.stream.findFirst({
    where: { id: streamId, channelId, channel: organizationId ? { organizationId } : undefined },
    select: { id: true, url: true, userAgent: true, referrer: true, failureCount: true, status: true },
  })
  if (!stream) return null

  let ok = false
  let detail = ''
  try {
    const u = new URL(stream.url)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || isPrivate(u.hostname)) {
      detail = 'blocked-host'
    } else {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      try {
        const res = await fetch(stream.url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': stream.userAgent || PROBE_UA,
            accept: '*/*',
            ...(stream.referrer ? { referer: stream.referrer } : {}),
            range: 'bytes=0-1024',
          },
        })
        ok = res.ok || res.status === 206
        detail = `HTTP ${res.status}`
        try {
          await res.body?.cancel()
        } catch {
          /* ignore */
        }
      } finally {
        clearTimeout(timer)
      }
    }
  } catch (err) {
    ok = false
    detail = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'unreachable'
  }

  let status = stream.status
  let failureCount = stream.failureCount
  if (ok) {
    failureCount = 0
    status = 'ACTIVE'
    await db.stream.update({ where: { id: streamId }, data: { failureCount: 0, status: 'ACTIVE', lastOkAt: new Date(), lastError: null } })
  } else {
    failureCount = stream.failureCount + 1
    const disable = failureCount >= FAILURE_THRESHOLD
    if (disable) status = 'DISABLED'
    await db.stream.update({
      where: { id: streamId },
      data: { failureCount, lastFailureAt: new Date(), lastError: detail.slice(0, 300), ...(disable ? { status: 'DISABLED' } : {}) },
    })
  }
  return { ok, detail, status, failureCount }
}
