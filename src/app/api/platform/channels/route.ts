import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError, platformRoute } from '@/lib/server/auth'
import { splitPipe } from '@/lib/server/iptv'

export const dynamic = 'force-dynamic'

/**
 * Paginated channel search for the plan builder's "specific channels" picker.
 * Server-side filtering — never ships the whole catalog to the browser.
 */
export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId')
  if (!organizationId) throw new HttpError(400, 'organizationId is required')
  const search = sp.get('search')?.trim()
  const category = sp.get('category') || undefined
  const language = sp.get('language') || undefined
  const country = sp.get('country') || undefined
  const region = sp.get('region') || undefined
  const sourceId = sp.get('sourceId') || undefined
  const ids = sp.get('ids')?.split(',').map((s) => s.trim()).filter(Boolean)
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(sp.get('pageSize') ?? '30', 10) || 30))

  // ids mode: resolve a specific set (for preloading selected channels by id)
  if (ids && ids.length > 0) {
    const rows = await db.channel.findMany({
      where: { organizationId, id: { in: ids.slice(0, 500) } },
      select: { id: true, name: true, logo: true, categories: true, languages: true, countryName: true, isNsfw: true, portalId: true },
    })
    return Response.json({ items: rows.map(shape), total: rows.length, page: 1, totalPages: 1 })
  }

  const where: Prisma.ChannelWhereInput = {
    organizationId,
    isActive: true,
    ...(search ? { name: { contains: search } } : {}),
    ...(category ? { categories: { contains: `|${category}|` } } : {}),
    ...(language ? { languages: { contains: `|${language}|` } } : {}),
    ...(country ? { country } : {}),
    ...(region ? { region } : {}),
    ...(sourceId ? { portalId: sourceId } : {}),
  }

  // Dedup the same channel across portals into ONE pick (keyed by identityKey), so the
  // operator sees a single "Colors" instead of one row per portal. The representative row's
  // id is what gets saved in the plan; playback still fails over across every portal (the
  // customer channel API merges same-identityKey sources).
  const [pageGroups, allGroups] = await Promise.all([
    db.channel.groupBy({ by: ['identityKey'], where, orderBy: { identityKey: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    db.channel.groupBy({ by: ['identityKey'], where }),
  ])
  const total = allGroups.length
  const keys = pageGroups.map((g) => g.identityKey).filter((k): k is string => k !== null)

  const members = keys.length
    ? await db.channel.findMany({
        where: { AND: [where, { identityKey: { in: keys } }] },
        select: { id: true, name: true, logo: true, categories: true, languages: true, countryName: true, isNsfw: true, portalId: true, identityKey: true },
      })
    : []

  const byKey = new Map<string, typeof members>()
  for (const m of members) {
    const k = m.identityKey ?? m.id
    const arr = byKey.get(k)
    if (arr) arr.push(m)
    else byKey.set(k, [m])
  }
  // Representative per group: prefer one with a logo, then richer metadata.
  const rep = (g: typeof members) =>
    [...g].sort((a, b) => {
      const al = a.logo ? 1 : 0, bl = b.logo ? 1 : 0
      if (al !== bl) return bl - al
      const am = (a.categories.length > 1 ? 1 : 0) + (a.languages.length > 1 ? 1 : 0)
      const bm = (b.categories.length > 1 ? 1 : 0) + (b.languages.length > 1 ? 1 : 0)
      return bm - am
    })[0]

  const items = keys
    .map((k) => byKey.get(k))
    .filter((g): g is typeof members => !!g && g.length > 0)
    .map((g) => ({ ...shape(rep(g)), sourceCount: g.length }))

  return Response.json({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
})

function shape(c: { id: string; name: string; logo: string | null; categories: string; languages: string; countryName: string | null; isNsfw: boolean; portalId: string | null }) {
  return {
    id: c.id,
    name: c.name,
    logo: c.logo,
    categories: splitPipe(c.categories),
    languages: splitPipe(c.languages),
    countryName: c.countryName,
    isNsfw: c.isNsfw,
    fromSource: !!c.portalId,
  }
}
