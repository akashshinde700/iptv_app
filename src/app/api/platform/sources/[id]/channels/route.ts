import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError, platformRouteCtx } from '@/lib/server/auth'
import { splitPipe } from '@/lib/server/iptv'

export const dynamic = 'force-dynamic'

/** Channels produced by one source (paginated, searchable) + its category tally. */
export const GET = platformRouteCtx<{ id: string }>(async (request, { params }) => {
  const { id } = await params
  const portal = await db.portal.findUnique({ where: { id }, select: { id: true } })
  if (!portal) throw new HttpError(404, 'Source not found')

  const sp = new URL(request.url).searchParams
  const search = sp.get('search')?.trim()
  const activeOnly = sp.get('active') !== 'all'
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = 40

  const where: Prisma.ChannelWhereInput = {
    portalId: id,
    ...(activeOnly ? { isActive: true } : {}),
    ...(search ? { name: { contains: search } } : {}),
  }
  const [total, channels, sample] = await Promise.all([
    db.channel.count({ where }),
    db.channel.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, logo: true, categories: true, countryName: true, isActive: true, isNsfw: true },
    }),
    // category tally over the whole source (bounded select)
    db.channel.findMany({ where: { portalId: id, isActive: true }, select: { categories: true }, take: 20000 }),
  ])

  const catCount = new Map<string, number>()
  for (const c of sample) for (const cat of splitPipe(c.categories)) catCount.set(cat, (catCount.get(cat) ?? 0) + 1)
  const categories = [...catCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)

  return Response.json({
    items: channels.map((c) => ({ ...c, categories: splitPipe(c.categories) })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    categories,
  })
})
