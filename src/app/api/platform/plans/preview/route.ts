import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { planRuleClauses } from '@/lib/server/access'
import { HttpError, platformRoute } from '@/lib/server/auth'
import { readJson } from '@/lib/server/billing'
import { portalValidityClause } from '@/lib/server/iptv'
import { toPipe } from '@/lib/server/plans'

export const dynamic = 'force-dynamic'

interface Body {
  organizationId?: string
  regions?: string[]
  countries?: string[]
  languages?: string[]
  categories?: string[]
  allowAdult?: boolean
  channelIds?: string[]
}

/** Live "this plan will include N channels" + a small sample — computed server-side. */
export const POST = platformRoute(async (request) => {
  const body = await readJson<Body>(request)
  if (!body.organizationId) throw new HttpError(400, 'organizationId is required')
  const now = new Date()

  const split = (v: string[] | undefined) => (toPipe(v) ?? '|').split('|').filter(Boolean)
  const rules = planRuleClauses({
    regions: split(body.regions),
    countries: split(body.countries),
    languages: split(body.languages),
    categories: split(body.categories),
    allowAdult: !!body.allowAdult,
  })

  const ruleWhere: Prisma.ChannelWhereInput = { AND: [{ organizationId: body.organizationId, isActive: true }, portalValidityClause(now), ...rules] }
  const channelIds = [...new Set((body.channelIds ?? []).filter(Boolean))].slice(0, 5000)

  // grant-only union: rule-matched channels OR the explicitly-added ones (same org, active)
  const where: Prisma.ChannelWhereInput = channelIds.length
    ? { OR: [ruleWhere, { AND: [{ organizationId: body.organizationId, isActive: true, id: { in: channelIds } }, portalValidityClause(now)] }] }
    : ruleWhere

  const [total, sample] = await Promise.all([
    db.channel.count({ where }),
    db.channel.findMany({ where, orderBy: { name: 'asc' }, take: 8, select: { name: true } }),
  ])
  return Response.json({ total, sample: sample.map((c) => c.name) })
})
