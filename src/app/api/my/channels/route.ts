import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { STREAM_SELECT, toChannelItem } from '@/lib/server/iptv'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Plan-gated channel list for the logged-in customer.
 * Rules, adult gating, overrides — all enforced server-side here.
 * Guests get 401 so the UI falls back to the public catalog.
 */
export async function GET(request: Request) {
  try {
    const identity = await getCustomer(request)
    if (!identity) {
      return Response.json({ error: 'Login required' }, { status: 401 })
    }

    const { where, state } = await buildCustomerChannelWhere(identity.id)
    if (!state.hasAccess) {
      return Response.json({ error: state.reason, accessDenied: true, reason: state.reason }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || undefined
    const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '24', 10) || 24))

    const finalWhere: Prisma.ChannelWhereInput = search
      ? { AND: [where, { name: { contains: search } }] }
      : where

    const [total, channels] = await Promise.all([
      db.channel.count({ where: finalWhere }),
      db.channel.findMany({
        where: finalWhere,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { streams: { select: STREAM_SELECT } },
      }),
    ])

    return Response.json({
      items: channels.map(toChannelItem),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
