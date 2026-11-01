import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { adminRoute } from '@/lib/server/auth'
import { STREAM_SELECT, toChannelItem } from '@/lib/server/iptv'

export const dynamic = 'force-dynamic'

function csv(searchParams: URLSearchParams, key: string): string[] {
  const raw = searchParams.get(key)
  if (!raw) return []
  return raw.split(',').map((v) => v.trim()).filter(Boolean)
}

/**
 * Admin channel browser — server-side pagination + all filters so it stays
 * fast at 10k–100k+ channels. Filters combine with AND; within a dimension OR.
 */
export const GET = adminRoute(async (request, admin) => {
  const { searchParams } = new URL(request.url)

  const search = searchParams.get('search')?.trim() || undefined
  const regions = csv(searchParams, 'region')
  const countries = csv(searchParams, 'country')
  const languages = csv(searchParams, 'language')
  const categories = csv(searchParams, 'category')
  const portalIds = csv(searchParams, 'portalId')
  const adult = searchParams.get('adult') // "all" | "included" | "excluded"
  const status = searchParams.get('status') // "all" | "active" | "inactive"
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '25', 10) || 25))

  const and: Prisma.ChannelWhereInput[] = [{ organizationId: admin.organizationId }]

  if (search) and.push({ OR: [{ name: { contains: search } }, { sourceId: { contains: search } }] })
  if (regions.length > 0) and.push({ region: { in: regions } })
  if (countries.length > 0) and.push({ country: { in: countries } })
  if (languages.length > 0) and.push({ OR: languages.map((l) => ({ languages: { contains: `|${l}|` } })) })
  if (categories.length > 0) and.push({ OR: categories.map((c) => ({ categories: { contains: `|${c}|` } })) })
  if (portalIds.length > 0) {
    and.push(
      portalIds.includes('__builtin__')
        ? { OR: [{ portalId: null }, { portalId: { in: portalIds.filter((p) => p !== '__builtin__') } }] }
        : { portalId: { in: portalIds } },
    )
  }
  if (adult === 'included') and.push({ isNsfw: true })
  if (adult === 'excluded') and.push({ isNsfw: false })
  if (status === 'active') and.push({ isActive: true })
  if (status === 'inactive') and.push({ isActive: false })

  const where: Prisma.ChannelWhereInput = and.length > 0 ? { AND: and } : {}

  const [total, channels] = await Promise.all([
    db.channel.count({ where }),
    db.channel.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { streams: { select: STREAM_SELECT }, portal: { select: { id: true, name: true, type: true } } },
    }),
  ])

  return Response.json({
    items: channels.map((channel) => ({
      ...toChannelItem(channel),
      isActive: channel.isActive,
      isDemo: channel.isDemo,
      region: channel.region,
      portal: channel.portal,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
})
