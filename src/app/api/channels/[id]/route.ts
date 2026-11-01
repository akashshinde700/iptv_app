import { db } from '@/lib/db'
import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import {
  STREAM_SELECT,
  channelIdentityKey,
  dedupeStreamsByUrl,
  pickBestStream,
  portalValidityClause,
  toChannelItem,
  toStreamInfo,
  type ChannelDetail,
} from '@/lib/server/iptv'
import { resolveActiveTenant } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

/**
 * Channel detail — access-gated:
 * - Demo channels (isDemo) are open to everyone (home showcase).
 * - Everything else requires a customer session whose plan rules match the
 *   channel; otherwise 403 so the UI can show the "plan lo" upsell.
 *
 * Cross-portal failover: the SAME channel often exists in several portals (Xtream / M3U /
 * Stalker) as separate rows. Once the caller is allowed to watch it, we merge the streams
 * from every portal that carries the same channel (matched on identityKey) into one
 * failover list, so if one source is dead the player silently moves to another portal's.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { id: organizationId } = await resolveActiveTenant(request)
    const channel = await db.channel.findFirst({
      where: { id, organizationId },
      include: { streams: { select: STREAM_SELECT } },
    })

    if (!channel) {
      return Response.json({ error: 'Channel not found' }, { status: 404 })
    }

    if (!channel.isDemo) {
      const identity = await getCustomer(request)
      if (!identity) {
        return Response.json(
          { error: 'Plan required — this channel is available once you have a plan', accessDenied: true, reason: 'guest' },
          { status: 403 }
        )
      }
      const { where, state } = await buildCustomerChannelWhere(identity.id)
      if (!state.hasAccess) {
        return Response.json(
          { error: state.reason, accessDenied: true, reason: state.reason },
          { status: 403 }
        )
      }
      const allowed = await db.channel.findFirst({ where: { AND: [where, { id }] }, select: { id: true } })
      if (!allowed) {
        return Response.json(
          { error: 'This channel is not included in your plan', accessDenied: true, reason: 'outside-plan' },
          { status: 403 }
        )
      }
    }

    // Gather sibling sources from other portals for the same logical channel. Matched by
    // identityKey and constrained to the same rating/visibility as the opened channel, so
    // aggregation can never surface adult or non-demo content the caller shouldn't see.
    let streams = channel.streams
    const key = channel.identityKey ?? channelIdentityKey(channel.name)
    if (key) {
      const siblings = await db.channel.findMany({
        where: {
          organizationId,
          identityKey: key,
          isActive: true,
          isDemo: channel.isDemo,
          isNsfw: channel.isNsfw,
          id: { not: channel.id },
          AND: [portalValidityClause()],
        },
        select: { streams: { select: STREAM_SELECT } },
        take: 40,
      })
      // Opened channel's own sources first, then the other portals'.
      streams = dedupeStreamsByUrl([channel.streams, ...siblings.map((s) => s.streams)])
    }

    // Every source disabled (operator turned it off, or all auto-disabled) → the channel is
    // off; don't serve a dead stream. Demo channels are exempt (always playable showcase).
    if (!channel.isDemo && streams.length > 0 && streams.every((s) => s.status === 'DISABLED')) {
      return Response.json(
        { error: 'This channel is currently unavailable', accessDenied: true, reason: 'disabled' },
        { status: 404 }
      )
    }

    const detail: ChannelDetail = {
      ...toChannelItem(channel),
      streamCount: streams.length,
      bestStream: pickBestStream(streams),
      streams: toStreamInfo(streams),
    }

    return Response.json({ channel: detail })
  } catch (error) {
    return toErrorResponse(error)
  }
}
