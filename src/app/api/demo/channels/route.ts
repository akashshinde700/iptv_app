import { db } from '@/lib/db'
import { toErrorResponse } from '@/lib/server/auth'
import { STREAM_SELECT, portalValidityClause, toChannelItem } from '@/lib/server/iptv'
import { resolveActiveTenant } from '@/lib/server/tenant'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Public demo channels — the ONLY catalog a guest can see/before buying a plan.
 * Admin kurated (isDemo), always family-safe, and still subject to source
 * validity (a demo channel from an expired source disappears automatically).
 */
export async function GET(request: Request) {
  try {
    const { id: organizationId } = await resolveActiveTenant(request)
    const where: Prisma.ChannelWhereInput = {
      AND: [
        { organizationId, isDemo: true, isActive: true, isNsfw: false },
        portalValidityClause(),
      ],
    }

    const channels = await db.channel.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 8,
      include: { streams: { select: STREAM_SELECT } },
    })

    return Response.json({
      items: channels.map(toChannelItem),
      total: channels.length,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
