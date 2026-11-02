import { db } from '@/lib/db'
import { clientIp, getCustomer, rateLimit, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { FAILURE_THRESHOLD } from '@/lib/server/iptv'
import { refreshChannelHealth, scheduleChannelRecheck } from '@/lib/server/health-doctor'
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const streamId = typeof body?.streamId === 'string' ? body.streamId.trim() : ''
    if (!streamId || typeof body.ok !== 'boolean') {
      return Response.json({ error: 'streamId and ok are required' }, { status: 400 })
    }

    const ip = clientIp(request)
    if (!rateLimit(`stream-report:${ip}`, 120, 60_000)) {
      return Response.json({ ok: true, throttled: true })
    }

    const stream = await db.stream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        channelId: true,
        status: true,
        disabledBy: true,
        failureCount: true,
        channel: { select: { id: true, isDemo: true, organizationId: true } },
      },
    })
    // Silently accept unknown/foreign streams — never leak which ids exist.
    if (!stream || stream.channel.organizationId !== organizationId) return Response.json({ ok: true })

    // Authorization: demo channels are open; everything else must be in the caller's plan.
    const identity = await getCustomer(request)
    if (!stream.channel.isDemo) {
      if (!identity) return Response.json({ ok: true })
      const { where, state } = await buildCustomerChannelWhere(identity.id)
      if (!state.hasAccess) return Response.json({ ok: true })
      const allowed = await db.channel.findFirst({ where: { AND: [where, { id: stream.channelId }] }, select: { id: true } })
      if (!allowed) return Response.json({ ok: true })
    }

    if (body.ok) {
      // Success resets the failure streak and recovers an *auto*-disabled source.
      // An operator-disabled source stays disabled: the player only needs to know it played, and a
      // deliberate "turn this off" decision must not be undone by client traffic (BUG-07).
      const operatorDisabled = stream.status === 'DISABLED' && stream.disabledBy === 'OPERATOR'
      await db.stream.update({
        where: { id: streamId },
        data: {
          failureCount: 0,
          lastOkAt: new Date(),
          ...(operatorDisabled ? {} : { status: 'ACTIVE', lastError: null }),
        },
      })
      if (!operatorDisabled) {
        // A working source means the channel is healthy again → un-hide it if the doctor hid it.
        void refreshChannelHealth([stream.channelId]).catch(() => {})
      }
      return Response.json({ ok: true, status: operatorDisabled ? 'DISABLED' : 'ACTIVE' })
    }

    // An anonymous failure report (demo channels only) must not count toward auto-disable —
    // otherwise anyone could take the public showcase offline by replaying `ok:false`. Ask the
    // health doctor to re-probe instead (debounced); a real server-side failure still disables.
    if (!identity) {
      scheduleChannelRecheck(stream.channelId)
      return Response.json({ ok: true })
    }

    const nextCount = stream.failureCount + 1
    const disable = nextCount >= FAILURE_THRESHOLD
    await db.stream.update({
      where: { id: streamId },
      data: {
        failureCount: nextCount,
        lastFailureAt: new Date(),
        lastProbeAt: new Date(),
        lastError: typeof body.error === 'string' ? body.error.slice(0, 300) : null,
        // Automatic disable — recoverable by a later passing probe / client report.
        ...(disable ? { status: 'DISABLED', disabledBy: 'AUTO' } : {}),
      },
    })

    // Customer-visible failure: recheck this channel's other sources soon (debounced), so the
    // next visit switches to a provider that works without anyone touching a "server" picker.
    if (disable) {
      scheduleChannelRecheck(stream.channelId)
      void refreshChannelHealth([stream.channelId]).catch(() => {})
    }
    return Response.json({ ok: true, failureCount: nextCount, disabled: disable })
  } catch (error) {
    return toErrorResponse(error)
  }
}
