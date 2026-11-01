import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { splitPipe } from '@/lib/server/iptv'

export const dynamic = 'force-dynamic'

/** Movies (VOD) catalog — plan-gated: any customer with an active plan gets the org's movies. */
export async function GET(request: Request) {
  try {
    const identity = await getCustomer(request)
    if (!identity) {
      return Response.json({ error: 'Plan required', accessDenied: true, reason: 'guest' }, { status: 403 })
    }
    const { state } = await buildCustomerChannelWhere(identity.id)
    if (!state.hasAccess) {
      return Response.json({ error: state.reason, accessDenied: true, reason: state.reason }, { status: 403 })
    }
    const organizationId = state.organizationId ?? identity.organizationId

    const sp = new URL(request.url).searchParams
    const search = sp.get('search')?.trim() || undefined
    const category = sp.get('category')?.trim() || undefined
    let page = Number.parseInt(sp.get('page') ?? '1', 10)
    if (!Number.isFinite(page) || page < 1) page = 1
    let pageSize = Number.parseInt(sp.get('pageSize') ?? '24', 10)
    if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 24
    if (pageSize > 60) pageSize = 60
    const sort = sp.get('sort') ?? 'latest'

    // Only movies from a live source, no adult (MVP), matching filters.
    const where: Prisma.MovieWhereInput = {
      organizationId,
      isActive: true,
      isNsfw: false,
      OR: [
        { portalId: null },
        { portal: { isActive: true, status: { in: ['ACTIVE', 'SYNCING'] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
      ],
      ...(search ? { title: { contains: search } } : {}),
      ...(category ? { categories: { contains: `|${category}|` } } : {}),
    }

    // Dedup the same movie across portals into one card, keyed by identityKey.
    const allGroups = await db.movie.groupBy({ by: ['identityKey'], where, _max: { addedAt: true } })
    const sortedGroups = allGroups
      .filter((group) => group.identityKey !== null)
      .sort((a, b) => {
        if (sort === 'name') return a.identityKey!.localeCompare(b.identityKey!)
        if (sort === 'nameDesc') return b.identityKey!.localeCompare(a.identityKey!)
        return (b._max.addedAt?.getTime() ?? 0) - (a._max.addedAt?.getTime() ?? 0)
      })
    const total = sortedGroups.length
    const pageGroups = sortedGroups.slice((page - 1) * pageSize, page * pageSize)
    const keys = pageGroups.map((g) => g.identityKey).filter((k): k is string => k !== null)

    const members = keys.length
      ? await db.movie.findMany({
          where: { AND: [where, { identityKey: { in: keys } }] },
          select: { id: true, title: true, poster: true, year: true, rating: true, genre: true, categories: true, identityKey: true },
        })
      : []
    const byKey = new Map<string, typeof members>()
    for (const m of members) {
      const k = m.identityKey as string
      const arr = byKey.get(k)
      if (arr) arr.push(m)
      else byKey.set(k, [m])
    }

    const items = keys
      .map((k) => byKey.get(k))
      .filter((g): g is typeof members => !!g && g.length > 0)
      .map((g) => {
        // representative: prefer one with a poster
        const rep = [...g].sort((a, b) => (b.poster ? 1 : 0) - (a.poster ? 1 : 0))[0]
        return {
          id: rep.id,
          title: rep.title,
          poster: rep.poster,
          year: rep.year,
          rating: rep.rating,
          genre: rep.genre,
          categories: splitPipe(rep.categories),
          sourceCount: g.length,
        }
      })

    return Response.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
