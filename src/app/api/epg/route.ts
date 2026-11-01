import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { guideForChannels } from '@/lib/server/epg'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Now / next guide for up to 30 channels the customer can actually watch.
 * Channels outside their plan are silently ignored (never a hint that they exist).
 */
export async function GET(request: Request) {
  try {
    const identity = await getCustomer(request)
    if (!identity) {
      return Response.json({ error: 'Plan required', accessDenied: true, reason: 'guest' }, { status: 403 })
    }
    const { state, where } = await buildCustomerChannelWhere(identity.id)
    if (!state.hasAccess) {
      return Response.json({ error: state.reason, accessDenied: true, reason: state.reason }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const ids = (searchParams.get('ids') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 30)

    if (ids.length === 0) return Response.json({ items: [] })

    const channels = await db.channel.findMany({
      where: { AND: [where, { id: { in: ids } }] },
      select: { id: true, name: true, sourceId: true },
    })

    const items = await guideForChannels(state.organizationId ?? identity.organizationId, channels)
    return Response.json(
      { items },
      { headers: { 'cache-control': 'private, max-age=60' } },
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
