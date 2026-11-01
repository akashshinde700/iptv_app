/**
 * Channel access engine — the single source of truth for "which channels can
 * this customer see?".
 *
 * Model: Customer → Plan → Rules (regions/countries/languages/categories)
 *        + CustomerOverride rows (manual allow/block)
 *        − adult channels when plan.allowAdult = false
 *        − everything when customer/plan inactive or expired.
 *
 * All enforcement is server-side; the frontend only renders what the API returns.
 */
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { splitPipe, portalValidityClause } from '@/lib/server/iptv'

export interface AccessState {
  hasAccess: boolean
  reason: string
  organizationId: string | null
  customerStatus: string
  planName: string | null
  planActive: boolean
  planExpired: boolean
  allowAdult: boolean
  regions: string[]
  countries: string[]
  languages: string[]
  categories: string[]
  /** channels the plan explicitly adds on top of its dimension rules (grant-only) */
  planChannelIds: string[]
  overrideAllowIds: string[]
  overrideBlockIds: string[]
}

function isPlanExpired(planExpiresAt: Date | null | undefined, planValidTo: Date | null | undefined): boolean {
  const now = new Date()
  if (planValidTo && planValidTo < now) return true
  if (planExpiresAt && planExpiresAt < now) return true
  return false
}

/**
 * Lazily sync customer.status with plan expiry (EXPIRED) so admin list view
 * also reflects reality without needing a cron job.
 */
async function syncCustomerStatus(customerId: string, status: string, planExpiresAt: Date | null) {
  const now = new Date()
  if (status === 'ACTIVE' && planExpiresAt && planExpiresAt < now) {
    await db.customer.update({ where: { id: customerId }, data: { status: 'EXPIRED' } })
    return 'EXPIRED'
  }
  return status
}

/** Evaluate the full access state for a customer (or a not-logged-in guest). */
export async function evaluateAccess(customerId: string | null): Promise<AccessState> {
  const denied = (reason: string, organizationId: string | null = null): AccessState => ({
    hasAccess: false,
    reason,
    organizationId,
    customerStatus: 'GUEST',
    planName: null,
    planActive: false,
    planExpired: false,
    allowAdult: false,
    regions: [],
    countries: [],
    languages: [],
    categories: [],
    planChannelIds: [],
    overrideAllowIds: [],
    overrideBlockIds: [],
  })

  if (!customerId) return denied('Login required')

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      plan: { include: { planChannels: { select: { channelId: true } } } },
      overrides: { select: { channelId: true, allow: true } },
    },
  })
  if (!customer) return denied('Customer not found')

  const status = await syncCustomerStatus(customer.id, customer.status, customer.planExpiresAt)
  if (status !== 'ACTIVE') return denied(`Customer ${status.toLowerCase()}`, customer.organizationId)
  if (!customer.plan) return denied('No plan assigned', customer.organizationId)
  if (!customer.plan.isActive) return denied('Plan inactive', customer.organizationId)

  const planExpired = isPlanExpired(customer.planExpiresAt, customer.plan.validTo)
  if (planExpired) return denied('Plan expired', customer.organizationId)

  const overrides = customer.overrides
  return {
    hasAccess: true,
    reason: 'ok',
    organizationId: customer.organizationId,
    customerStatus: status,
    planName: customer.plan.name,
    planActive: true,
    planExpired: false,
    allowAdult: customer.plan.allowAdult,
    regions: splitPipe(customer.plan.regions),
    countries: splitPipe(customer.plan.countries),
    languages: splitPipe(customer.plan.languages),
    categories: splitPipe(customer.plan.categories),
    planChannelIds: customer.plan.planChannels.map((pc) => pc.channelId),
    overrideAllowIds: overrides.filter((o) => o.allow).map((o) => o.channelId),
    overrideBlockIds: overrides.filter((o) => !o.allow).map((o) => o.channelId),
  }
}

export interface PlanRules {
  regions: string[]
  countries: string[]
  languages: string[]
  categories: string[]
  allowAdult: boolean
}

/**
 * A plan's dimension rules as AND-able clauses. Empty selection = unrestricted for
 * that dimension; within a dimension selections are OR, across dimensions AND.
 */
export function planRuleClauses(rules: PlanRules): Prisma.ChannelWhereInput[] {
  const and: Prisma.ChannelWhereInput[] = []
  if (rules.regions.length > 0) and.push({ region: { in: rules.regions } })
  if (rules.countries.length > 0) and.push({ country: { in: rules.countries } })

  const langOr: Prisma.ChannelWhereInput[] = rules.languages.map((lang) => ({
    languages: { contains: `|${lang}|` },
  }))
  if (langOr.length > 0) and.push({ OR: langOr })

  const catOr: Prisma.ChannelWhereInput[] = rules.categories.map((cat) => ({
    categories: { contains: `|${cat}|` },
  }))
  if (catOr.length > 0) and.push({ OR: catOr })

  // Adult gating (plan-level) — enforced even in search and filters.
  if (!rules.allowAdult) and.push({ isNsfw: false })
  return and
}

/** Prisma where-clause matching every channel the customer may access. */
export async function buildCustomerChannelWhere(customerId: string): Promise<{
  where: Prisma.ChannelWhereInput
  state: AccessState
}> {
  const state = await evaluateAccess(customerId)
  if (!state.hasAccess) {
    return { where: { id: { in: ['__none__'] } }, state }
  }

  const and: Prisma.ChannelWhereInput[] = [{ isActive: true }]

  // Tenant scope — a customer can only ever see their own organization's channels.
  if (state.organizationId) and.push({ organizationId: state.organizationId })

  // Validity guard: channels of expired / dead / inactive sources are never served,
  // even if plan rules would otherwise match them.
  and.push(portalValidityClause())

  and.push(...planRuleClauses(state))

  const where: Prisma.ChannelWhereInput = {}
  const baseAnd: Prisma.ChannelWhereInput[] = [...and]
  if (state.overrideBlockIds.length > 0) baseAnd.push({ id: { notIn: state.overrideBlockIds } })
  const baseClause: Prisma.ChannelWhereInput = { AND: baseAnd }

  // Grant-only additions: channels reachable even when the dimension rules don't match.
  // Each is still scoped to the org, must be active and pass source validity.
  //  - plan's explicit channels: block always wins over the grant
  //  - per-customer allow overrides: existing behaviour (kept as-is)
  const grantClause = (ids: string[], respectBlocks: boolean): Prisma.ChannelWhereInput => ({
    AND: [
      { id: { in: ids } },
      ...(respectBlocks && state.overrideBlockIds.length > 0 ? [{ id: { notIn: state.overrideBlockIds } }] : []),
      ...(state.organizationId ? [{ organizationId: state.organizationId }] : []),
      { isActive: true },
      portalValidityClause(),
    ],
  })

  const grants: Prisma.ChannelWhereInput[] = []
  if (state.planChannelIds.length > 0) grants.push(grantClause(state.planChannelIds, true))
  if (state.overrideAllowIds.length > 0) grants.push(grantClause(state.overrideAllowIds, false))

  if (grants.length > 0) {
    where.OR = [baseClause, ...grants]
  } else {
    where.AND = baseAnd
  }

  return { where, state }
}

export interface AccessBreakdown {
  total: number
  byRegion: { key: string; count: number }[]
  byCountry: { key: string; count: number }[]
  byLanguage: { key: string; count: number }[]
  byCategory: { key: string; count: number }[]
}

/** Aggregated "customer will receive" summary for the admin preview UI. */
export async function computeAccessSummary(customerId: string): Promise<AccessBreakdown & { state: AccessState }> {
  const { where, state } = await buildCustomerChannelWhere(customerId)
  const channels = await db.channel.findMany({
    where,
    select: {
      region: true,
      country: true,
      countryName: true,
      languages: true,
      categories: true,
    },
  })

  const tally = (values: (string | null)[]) => {
    const map = new Map<string, number>()
    for (const value of values) {
      if (!value) continue
      map.set(value, (map.get(value) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
  }

  const langCount = new Map<string, number>()
  const catCount = new Map<string, number>()
  const countryNames = new Map<string, string>()
  for (const channel of channels) {
    for (const lang of splitPipe(channel.languages)) {
      langCount.set(lang, (langCount.get(lang) ?? 0) + 1)
    }
    for (const cat of splitPipe(channel.categories)) {
      catCount.set(cat, (catCount.get(cat) ?? 0) + 1)
    }
    if (channel.country && channel.countryName) countryNames.set(channel.country, channel.countryName)
  }

  return {
    total: channels.length,
    byRegion: tally(channels.map((c) => c.region)),
    byCountry: tally(channels.map((c) => (c.country ? countryNames.get(c.country) ?? c.country : null))),
    byLanguage: [...langCount.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    byCategory: [...catCount.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
    state,
  }
}
