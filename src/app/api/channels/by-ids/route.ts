import { db } from '@/lib/db'
import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { STREAM_SELECT, toChannelItem } from '@/lib/server/iptv'
import { resolveActiveTenant } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

const MAX_IDS = 200

/**
 * Batch fetch by ids (favorites / recents) — plan-gated:
 * - Guests only ever resolve demo channels.
 * - Customers resolve the ids their plan still allows (saved channels that
 *   fell out of the plan simply don't appear).
 */
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get('ids') ?? ''
    const ids = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))]

    if (ids.length === 0) {
      return Response.json({ items: [] })
    }
    if (ids.length > MAX_IDS) {
      return Response.json({ error: `Too many ids: max ${MAX_IDS} allowed` }, { status: 400 })
    }

    const { id: organizationId } = await resolveActiveTenant(request)
    const identity = await getCustomer(request)
    let where: Record<string, unknown>

    if (!identity) {
      // Guests: only demo channels resolve.
      where = { organizationId, id: { in: ids }, isActive: true, isDemo: true }
    } else {
      const { where: customerWhere, state } = await buildCustomerChannelWhere(identity.id)
      if (!state.hasAccess) {
        return Response.json({ items: [], accessDenied: true, reason: state.reason })
      }
      where = { AND: [customerWhere, { id: { in: ids } }] }
    }

    const channels = await db.channel.findMany({
      where,
      include: { streams: { select: STREAM_SELECT } },
    })

    return Response.json({ items: channels.map(toChannelItem) })
  } catch (error) {
    return toErrorResponse(error)
  }
}
