import { db } from '@/lib/db'
import { clientIp, getCustomer, rateLimit, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { FAILURE_THRESHOLD } from '@/lib/server/iptv'
import { resolveActiveTenant } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Playback health report from the player. The player calls this when a stream fails
 * (so we fail over and, after FAILURE_THRESHOLD consecutive failures, auto-disable that
 * ONE stream — never the channel) or succeeds (reset the counter; recover a disabled one).
 *
 * Only streams on a channel the caller may actually watch can be reported, so a client
 * can't disable arbitrary streams.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { id: organizationId } = await resolveActiveTenant(request)
    let body: { streamId?: string; ok?: boolean; error?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const streamId = body.streamId?.trim()
    if (!streamId || typeof body.ok !== 'boolean') {
      return Response.json({ error: 'streamId and ok are required' }, { status: 400 })
    }

    const ip = clientIp(request)
    if (!rateLimit(`stream-report:${ip}`, 120, 60_000)) {
      return Response.json({ ok: true, throttled: true })
    }

    const stream = await db.stream.findUnique({
      where: { id: streamId },
      select: { id: true, channelId: true, status: true, failureCount: true, channel: { select: { id: true, isDemo: true, organizationId: true } } },
    })
    // Silently accept unknown/foreign streams — never leak which ids exist.
    if (!stream || stream.channel.organizationId !== organizationId) return Response.json({ ok: true })

    // Authorization: demo channels are open; everything else must be in the caller's plan.
    if (!stream.channel.isDemo) {
      const identity = await getCustomer(request)
      if (!identity) return Response.json({ ok: true })
      const { where, state } = await buildCustomerChannelWhere(identity.id)
      if (!state.hasAccess) return Response.json({ ok: true })
      const allowed = await db.channel.findFirst({ where: { AND: [where, { id: stream.channelId }] }, select: { id: true } })
      if (!allowed) return Response.json({ ok: true })
    }

    if (body.ok) {
      // success resets the streak and recovers a stream that had been disabled
      await db.stream.update({
        where: { id: streamId },
        data: { failureCount: 0, lastOkAt: new Date(), status: 'ACTIVE', lastError: null },
      })
      return Response.json({ ok: true, status: 'ACTIVE' })
    }

    const nextCount = stream.failureCount + 1
    const disable = nextCount >= FAILURE_THRESHOLD
    await db.stream.update({
      where: { id: streamId },
      data: {
        failureCount: nextCount,
        lastFailureAt: new Date(),
        lastError: body.error?.slice(0, 300) ?? null,
        ...(disable ? { status: 'DISABLED' } : {}),
      },
    })
    return Response.json({ ok: true, failureCount: nextCount, disabled: disable })
  } catch (error) {
    return toErrorResponse(error)
  }
}
