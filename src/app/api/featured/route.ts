import { db } from '@/lib/db'
import { getCustomer } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { toErrorResponse } from '@/lib/server/auth'
import { STREAM_SELECT, portalValidityClause, toChannelItem } from '@/lib/server/iptv'
import type { ChannelItem } from '@/lib/server/iptv'
import { resolveActiveTenant } from '@/lib/server/tenant'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface FeaturedRowDef {
  id: string
  title: string
  country?: string
  category?: string
}

const FEATURED_ROWS: FeaturedRowDef[] = [
  { id: 'in', title: 'Popular in India', country: 'IN' },
  { id: 'news', title: 'News', category: 'news' },
  { id: 'sports', title: 'Sports', category: 'sports' },
  { id: 'movies', title: 'Movies', category: 'movies' },
  { id: 'music', title: 'Music', category: 'music' },
  { id: 'kids', title: 'Kids & Family', category: 'kids' },
  { id: 'entertainment', title: 'Entertainment', category: 'entertainment' },
  { id: 'documentary', title: 'Documentary', category: 'documentary' },
  { id: 'religious', title: 'Devotional', category: 'religious' },
  { id: 'us', title: 'United States', country: 'US' },
  { id: 'uk', title: 'United Kingdom', country: 'UK' },
]

interface FeaturedRow {
  id: string
  title: string
  params: Record<string, string>
  total: number
  items: ChannelItem[]
}

export interface FeaturedPayload {
  rows: FeaturedRow[]
  /** 'plan' = customer catalog rows; 'demo' = guest showcase */
  mode: 'plan' | 'demo'
}

const FEATURED_TTL_MS = 10 * 60 * 1000

/* ----------------------------- Guest (demo) path ---------------------------- */

async function demoRow(organizationId: string): Promise<FeaturedPayload> {
  const channels = await db.channel.findMany({
    where: { AND: [{ organizationId, isDemo: true, isActive: true, isNsfw: false }, portalValidityClause()] },
    orderBy: { name: 'asc' },
    take: 8,
    include: { streams: { select: STREAM_SELECT } },
  })
  const items = channels.map(toChannelItem)
  return {
    mode: 'demo',
    rows: [{ id: 'demo', title: 'Free demo — try it', params: {}, total: items.length, items }],
  }
}

/* --------------------------- Customer (plan) path --------------------------- */

function rowFilter(def: FeaturedRowDef): Prisma.ChannelWhereInput {
  if (def.country) return { country: def.country }
  if (def.category) return { categories: { contains: `|${def.category}|` } }
  return {}
}

function rowParams(def: FeaturedRowDef): Record<string, string> {
  const params: Record<string, string> = {}
  if (def.country) params.country = def.country
  if (def.category) params.category = def.category
  return params
}

const planCache = new Map<string, { at: number; data: FeaturedPayload }>()

async function planFeatured(customerId: string, cacheKey: string, organizationId: string): Promise<FeaturedPayload> {
  const cached = planCache.get(cacheKey)
  if (cached && Date.now() - cached.at < FEATURED_TTL_MS) return cached.data

  const { where: customerWhere, state } = await buildCustomerChannelWhere(customerId)
  if (!state.hasAccess) return demoRow(organizationId)

  const rows = await Promise.all(
    FEATURED_ROWS.map(async (def) => {
      const where: Prisma.ChannelWhereInput = { AND: [customerWhere, rowFilter(def)] }
      const [total, channels] = await Promise.all([
        db.channel.count({ where }),
        db.channel.findMany({
          where,
          orderBy: { name: 'asc' },
          take: 18,
          include: { streams: { select: STREAM_SELECT } },
        }),
      ])
      return { id: def.id, title: def.title, params: rowParams(def), total, items: channels.map(toChannelItem) }
    })
  )

  // drop rows that hold nothing inside this plan (keeps home tight + honest)
  const filled = rows.filter((row) => row.total > 0)

  const data: FeaturedPayload = { mode: 'plan', rows: filled }
  if (planCache.size > 50) {
    const oldest = planCache.keys().next().value
    if (oldest) planCache.delete(oldest)
  }
  planCache.set(cacheKey, { at: Date.now(), data })
  return data
}

export async function GET(request: Request) {
  try {
    const { id: organizationId } = await resolveActiveTenant(request)
    const identity = await getCustomer(request)
    if (!identity) return Response.json(await demoRow(organizationId))

    const customer = await db.customer.findUnique({
      where: { id: identity.id },
      select: { planId: true, planExpiresAt: true, plan: { select: { allowAdult: true, updatedAt: true } } },
    })

    const cacheKey = [
      identity.id,
      customer?.planId ?? 'no-plan',
      customer?.plan?.updatedAt?.toISOString() ?? '-',
      customer?.planExpiresAt?.toISOString() ?? '-',
      customer?.plan?.allowAdult ? 'adult' : 'family',
    ].join('|')

    return Response.json(await planFeatured(identity.id, cacheKey, organizationId))
  } catch (error) {
    return toErrorResponse(error)
  }
}
