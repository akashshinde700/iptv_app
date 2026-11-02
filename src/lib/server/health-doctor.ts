/**
 * The **health doctor** — automatic detection and removal of dead sources.
 *
 * Problem it solves: an operator pastes an M3U link, an Xtream panel and a Stalker portal.
 * Some channels exist in all three, some only in one, and any of them can die at any time.
 * Before this, a dead stream stayed in the catalog until a customer hit it and a human
 * noticed.
 *
 * What happens now:
 *   1. The doctor probes streams server-side (HLS-aware: a manifest must really be a
 *      manifest, not an HTML error page) and records `status`, `failureCount`, latency and
 *      `lastProbeAt`.
 *   2. A stream that fails `FAILURE_THRESHOLD` times in a row is **auto-disabled**, so the
 *      catalog stops offering it. It keeps being re-probed, so it comes back by itself when
 *      the provider fixes it.
 *   3. Each touched channel's health becomes OK / DEGRADED / DEAD. A DEAD channel is
 *      **auto-hidden** (`isActive=false` + `autoHiddenAt`) so no customer ever sees a
 *      channel that cannot play, and is **auto-restored** the moment one of its sources
 *      answers again.
 *
 * Everything is org-scoped and can run from a cron (see /api/cron/health) or from the admin
 * "Scan & fix now" button. All of it is best-effort: a failed probe never throws.
 */
import { db } from '@/lib/db'
import { FAILURE_THRESHOLD } from '@/lib/server/iptv'
import { isPublicHttpUrl, resolvedPublicUrl } from '@/lib/server/net-guard'

/** How a single probe finished. */
export interface ProbeOutcome {
  ok: boolean
  /** short machine-ish reason kept in Stream.lastError, e.g. "hls-no-segments", "HTTP 403" */
  detail: string
  latencyMs: number | null
}

const PROBE_TIMEOUT_MS = 10_000
const PROBE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
/** Hard cap on bytes we read while validating a playlist (a fake "manifest" can be huge). */
const MAX_MANIFEST_BYTES = 256 * 1024

interface ProbeTarget {
  url: string
  userAgent?: string | null
  referrer?: string | null
}

/**
 * Validate one stream URL.
 *
 * Why not just `HTTP 200`: dead Xtream/Stalker panels happily answer 200 with an HTML
 * "account expired" page, and expired M3U links return a redirect to a sales page. So for
 * HLS we require a real `#EXTM3U` body with at least one variant/segment; for progressive
 * files we require a successful ranged GET with actual bytes.
 */
export async function probeStreamUrl(target: ProbeTarget): Promise<ProbeOutcome> {
  if (!isPublicHttpUrl(target.url)) {
    return { ok: false, detail: 'blocked-host', latencyMs: null }
  }
  // A hostname can look public and still resolve into the private network (rebinding, nip.io).
  if (!(await resolvedPublicUrl(target.url))) {
    return { ok: false, detail: 'blocked-host', latencyMs: null }
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const headers: Record<string, string> = {
    'user-agent': target.userAgent?.trim() || PROBE_UA,
    accept: '*/*',
    ...(target.referrer?.trim() ? { referer: target.referrer.trim() } : {}),
  }

  try {
    const looksHls = /\.m3u8?(?:$|\?)/i.test(target.url)

    if (looksHls) {
      const res = await fetch(target.url, { headers: { ...headers, range: 'bytes=0-262143' }, redirect: 'follow', signal: controller.signal })
      if (!res.ok && res.status !== 206) return { ok: false, detail: `HTTP ${res.status}`, latencyMs: Date.now() - startedAt }
      const body = (await res.text()).slice(0, MAX_MANIFEST_BYTES)
      const latencyMs = Date.now() - startedAt
      if (!/#EXTM3U/i.test(body)) return { ok: false, detail: 'not-a-manifest', latencyMs }
      const segments = body.match(/^[^#\s].*$/gm)?.filter((line) => line.trim().length > 0) ?? []
      if (segments.length === 0) return { ok: false, detail: 'hls-empty', latencyMs }
      return { ok: true, detail: `HLS ${segments.length} entries`, latencyMs }
    }

    // Progressive (ts / mp4 / mkv): a small ranged GET is enough to prove the host serves data.
    const res = await fetch(target.url, { headers: { ...headers, range: 'bytes=0-4096' }, redirect: 'follow', signal: controller.signal })
    if (!res.ok && res.status !== 206) return { ok: false, detail: `HTTP ${res.status}`, latencyMs: Date.now() - startedAt }
    const contentType = res.headers.get('content-type') ?? ''
    if (/text\/html/i.test(contentType)) {
      // A video URL that answers HTML is almost always an error/expired page.
      return { ok: false, detail: 'served-html', latencyMs: Date.now() - startedAt }
    }
    const buf = await res.arrayBuffer().catch(() => null)
    if (!buf || buf.byteLength === 0) return { ok: false, detail: 'empty-body', latencyMs: Date.now() - startedAt }
    return { ok: true, detail: contentType || 'binary', latencyMs: Date.now() - startedAt }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, detail: aborted ? 'timeout' : 'unreachable', latencyMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A probe never overrides an operator's decision (BUG-07).
 *
 * The health sweep used to flip every successful probe back to ACTIVE, so an operator who
 * deliberately switched a bad/geo-blocked/leaky source off found it switched back on within
 * minutes — and a client "ok" report did the same. `disabledBy` distinguishes the two reasons:
 * only an AUTO disable is recoverable by a passing probe.
 */
export function canProbeRevive(stream: { status: string; disabledBy?: string | null }): boolean {
  return stream.status !== 'DISABLED' || (stream.disabledBy ?? 'AUTO') !== 'OPERATOR'
}

/** Persist a probe result on one stream (and flip ACTIVE/DISABLED at the threshold). */
export async function recordProbe(
  stream: { id: string; failureCount: number; status: string; disabledBy?: string | null },
  outcome: ProbeOutcome,
): Promise<{ status: string; failureCount: number; changed: boolean }> {
  const now = new Date()
  if (outcome.ok) {
    const operatorDisabled = !canProbeRevive(stream)
    const changed = !operatorDisabled && (stream.status !== 'ACTIVE' || stream.failureCount !== 0)
    await db.stream.update({
      where: { id: stream.id },
      data: {
        // An operator-disabled source stays disabled; we still record that it answered.
        ...(operatorDisabled ? {} : { status: 'ACTIVE', lastError: null }),
        failureCount: 0,
        lastOkAt: now,
        lastProbeAt: now,
        latencyMs: outcome.latencyMs,
      },
    })
    return { status: operatorDisabled ? 'DISABLED' : 'ACTIVE', failureCount: 0, changed }
  }

  const failureCount = stream.failureCount + 1
  const disabled = failureCount >= FAILURE_THRESHOLD
  await db.stream.update({
    where: { id: stream.id },
    data: {
      failureCount,
      lastFailureAt: now,
      lastProbeAt: now,
      latencyMs: outcome.latencyMs,
      lastError: outcome.detail.slice(0, 200),
      ...(disabled ? { status: 'DISABLED', disabledBy: 'AUTO' } : {}),
    },
  })
  return { status: disabled ? 'DISABLED' : stream.status, failureCount, changed: disabled && stream.status !== 'DISABLED' }
}

export interface ChannelHealthResult {
  channelId: string
  health: 'OK' | 'DEGRADED' | 'DEAD'
  active: number
  disabled: number
  hidden: boolean
  restored: boolean
}

/**
 * Recompute health for the given channels and hide/restore them accordingly.
 * Demo channels are never auto-hidden: they are the free showcase, and an operator should
 * decide manually if the demo row broke.
 */
export async function refreshChannelHealth(channelIds: string[]): Promise<ChannelHealthResult[]> {
  const ids = [...new Set(channelIds)].filter(Boolean)
  if (ids.length === 0) return []

  const streams = await db.stream.groupBy({
    by: ['channelId', 'status'],
    where: { channelId: { in: ids } },
    _count: { _all: true },
  })
  const counts = new Map<string, { active: number; disabled: number }>()
  for (const row of streams) {
    const entry = counts.get(row.channelId) ?? { active: 0, disabled: 0 }
    if (row.status === 'DISABLED') entry.disabled += row._count._all
    else entry.active += row._count._all
    counts.set(row.channelId, entry)
  }

  const channels = await db.channel.findMany({
    where: { id: { in: ids } },
    select: { id: true, isActive: true, isDemo: true, autoHiddenAt: true, healthStatus: true },
  })

  const results: ChannelHealthResult[] = []
  const now = new Date()

  for (const channel of channels) {
    const { active, disabled } = counts.get(channel.id) ?? { active: 0, disabled: 0 }
    const health: 'OK' | 'DEGRADED' | 'DEAD' = active === 0 ? 'DEAD' : disabled > 0 ? 'DEGRADED' : 'OK'

    let hidden = false
    let restored = false
    // Typed as the subset we touch, so Prisma's ChannelUpdateInput still type-checks it.
    const data: { healthStatus: string; lastHealthAt: Date; isActive?: boolean; autoHiddenAt?: Date | null } = {
      healthStatus: health,
      lastHealthAt: now,
    }

    if (health === 'DEAD' && channel.isActive && !channel.isDemo) {
      // nothing playable → take it out of the customer catalog until it recovers
      data.isActive = false
      data.autoHiddenAt = now
      hidden = true
    } else if (health !== 'DEAD' && channel.autoHiddenAt) {
      // a source is answering again → put the channel back, untouched by the operator
      data.isActive = true
      data.autoHiddenAt = null
      restored = true
    }

    await db.channel.update({ where: { id: channel.id }, data })
    results.push({ channelId: channel.id, health, active, disabled, hidden, restored })
  }

  return results
}

export interface SweepOptions {
  /** stop starting new probes after this many ms (serverless request budgets) */
  budgetMs?: number
  /** how many streams to probe in this run */
  batch?: number
  /** parallel probes */
  concurrency?: number
  /** only re-probe streams whose last probe is older than this (default 6h) */
  staleAfterMs?: number
}

export interface SweepSummary {
  organizationId: string | null
  probed: number
  ok: number
  failed: number
  disabled: number
  recovered: number
  channelsChecked: number
  channelsHidden: number
  channelsRestored: number
  remaining: number
  durationMs: number
}

const DEFAULT_BUDGET_MS = 25_000
const DEFAULT_BATCH = 80
const DEFAULT_CONCURRENCY = 8
const DEFAULT_STALE_MS = 6 * 60 * 60 * 1000

/**
 * Probe a rotating batch of streams and apply the results.
 *
 * Ordering is deliberate: never-probed first, then streams that have failed most recently,
 * then the oldest probes. That means a freshly added playlist gets validated immediately,
 * a channel that just broke is rechecked soon, and a healthy catalog is re-verified in the
 * background without hammering providers.
 */
export async function runHealthSweep(
  scope: { organizationId?: string | null },
  options: SweepOptions = {},
): Promise<SweepSummary> {
  const startedAt = Date.now()
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS
  const batch = Math.max(1, options.batch ?? DEFAULT_BATCH)
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_MS
  const orgId = scope.organizationId ?? null
  const staleBefore = new Date(startedAt - staleAfterMs)

  const orgFilter = orgId ? { channel: { organizationId: orgId } } : {}

  const candidates = await db.stream.findMany({
    where: {
      ...orgFilter,
      OR: [{ lastProbeAt: null }, { lastProbeAt: { lt: staleBefore } }],
    },
    select: {
      id: true,
      url: true,
      userAgent: true,
      referrer: true,
      status: true,
      disabledBy: true,
      failureCount: true,
      channelId: true,
    },
    orderBy: [{ lastProbeAt: 'asc' }, { lastFailureAt: 'desc' }],
    take: batch,
  })

  const summary: SweepSummary = {
    organizationId: orgId,
    probed: 0,
    ok: 0,
    failed: 0,
    disabled: 0,
    recovered: 0,
    channelsChecked: 0,
    channelsHidden: 0,
    channelsRestored: 0,
    remaining: 0,
    durationMs: 0,
  }

  const touchedChannels = new Set<string>()
  let cursor = 0

  async function worker() {
    while (cursor < candidates.length && Date.now() - startedAt < budgetMs) {
      const stream = candidates[cursor]
      cursor += 1
      const outcome = await probeStreamUrl(stream)
      const result = await recordProbe(stream, outcome)
      summary.probed += 1
      if (outcome.ok) summary.ok += 1
      else summary.failed += 1
      if (result.status === 'DISABLED' && result.changed) summary.disabled += 1
      if (outcome.ok && result.status === 'ACTIVE' && stream.status === 'DISABLED') summary.recovered += 1
      touchedChannels.add(stream.channelId)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()))

  const health = await refreshChannelHealth([...touchedChannels])
  summary.channelsChecked = health.length
  summary.channelsHidden = health.filter((h) => h.hidden).length
  summary.channelsRestored = health.filter((h) => h.restored).length
  summary.durationMs = Date.now() - startedAt

  // how much work is left (cheap count; drives the admin progress bar)
  summary.remaining = await db.stream.count({
    where: { ...orgFilter, OR: [{ lastProbeAt: null }, { lastProbeAt: { lt: staleBefore } }] },
  })

  return summary
}

export interface HealthSnapshot {
  channels: { total: number; ok: number; degraded: number; dead: number; hidden: number; unknown: number }
  streams: { total: number; active: number; disabled: number; unchecked: number; checkedLastHour: number }
  lastCheckedAt: string | null
  /** true when every stream currently in the catalog has been probed at least once */
  fullyChecked: boolean
}

/** Aggregate numbers for the admin health panel / dashboard card. */
export async function healthSnapshot(organizationId: string): Promise<HealthSnapshot> {
  const [channelGroups, streamGroups, unchecked, checkedRecent, lastProbe] = await Promise.all([
    db.channel.groupBy({
      by: ['healthStatus'],
      where: { organizationId },
      _count: { _all: true },
    }),
    db.stream.groupBy({
      by: ['status'],
      where: { channel: { organizationId } },
      _count: { _all: true },
    }),
    db.stream.count({ where: { channel: { organizationId }, lastProbeAt: null } }),
    db.stream.count({
      where: { channel: { organizationId }, lastProbeAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    }),
    db.stream.findFirst({
      where: { channel: { organizationId }, lastProbeAt: { not: null } },
      orderBy: { lastProbeAt: 'desc' },
      select: { lastProbeAt: true },
    }),
  ])

  const channels = { total: 0, ok: 0, degraded: 0, dead: 0, hidden: 0, unknown: 0 }
  for (const row of channelGroups) {
    const count = row._count._all
    channels.total += count
    if (row.healthStatus === 'OK') channels.ok += count
    else if (row.healthStatus === 'DEGRADED') channels.degraded += count
    else if (row.healthStatus === 'DEAD') channels.dead += count
    else channels.unknown += count
  }
  channels.hidden = await db.channel.count({ where: { organizationId, autoHiddenAt: { not: null } } })

  const streams = { total: 0, active: 0, disabled: 0, unchecked, checkedLastHour: checkedRecent }
  for (const row of streamGroups) {
    streams.total += row._count._all
    if (row.status === 'DISABLED') streams.disabled += row._count._all
    else streams.active += row._count._all
  }

  return {
    channels,
    streams,
    lastCheckedAt: lastProbe?.lastProbeAt?.toISOString() ?? null,
    fullyChecked: streams.total > 0 && unchecked === 0,
  }
}

/**
 * Fire-and-forget recheck of one channel's streams, used when a customer reports playback
 * failure: the other providers for the same channel may still work, and this makes the very
 * next visit pick a live one. Debounced in-memory so a burst of failures costs one sweep.
 */
const recheckAt = new Map<string, number>()
export function scheduleChannelRecheck(channelId: string): void {
  const last = recheckAt.get(channelId) ?? 0
  if (Date.now() - last < 60_000) return
  recheckAt.set(channelId, Date.now())
  void (async () => {
    try {
      const streams = await db.stream.findMany({
        where: { channelId },
        select: {
          id: true,
          url: true,
          userAgent: true,
          referrer: true,
          status: true,
          disabledBy: true,
          failureCount: true,
        },
        take: 12,
      })
      for (const stream of streams) {
        const outcome = await probeStreamUrl(stream)
        await recordProbe(stream, outcome)
      }
      await refreshChannelHealth([channelId])
    } catch {
      /* best effort — the cron will catch up */
    }
  })()
}
