import { db } from '@/lib/db'
import { toErrorResponse } from '@/lib/server/auth'
import { planRuleClauses } from '@/lib/server/access'
import { portalValidityClause, splitPipe } from '@/lib/server/iptv'
import { resolveActiveTenant } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

export interface PublicPlan {
  id: string
  name: string
  description: string | null
  price: number
  durationDays: number
  maxDevices: number
  allowAdult: boolean
  channelCount: number
}

const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; items: PublicPlan[] }>()

/**
 * Read-only list of the storefront's purchasable plans (login + subscription screens).
 * Only what a customer may see: no rules, no customer counts. Channel counts use the
 * same plan-rule clauses as the access engine.
 */
export async function GET(request: Request) {
  try {
    const { id: organizationId } = await resolveActiveTenant(request)
    const hit = cache.get(organizationId)
    if (hit && Date.now() - hit.at < TTL_MS) return Response.json({ items: hit.items })

    const now = new Date()
    const plans = await db.plan.findMany({
      where: { organizationId, isActive: true, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      orderBy: [{ price: 'asc' }, { name: 'asc' }],
    })

    const items: PublicPlan[] = await Promise.all(
      plans.map(async (plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        durationDays: plan.durationDays,
        maxDevices: plan.maxDevices,
        allowAdult: plan.allowAdult,
        channelCount: await db.channel.count({
          where: {
            AND: [
              { organizationId, isActive: true },
              portalValidityClause(now),
              ...planRuleClauses({
                regions: splitPipe(plan.regions),
                countries: splitPipe(plan.countries),
                languages: splitPipe(plan.languages),
                categories: splitPipe(plan.categories),
                allowAdult: plan.allowAdult,
              }),
            ],
          },
        }),
      })),
    )

    if (cache.size > 100) cache.clear()
    cache.set(organizationId, { at: Date.now(), items })
    return Response.json({ items })
  } catch (error) {
    return toErrorResponse(error)
  }
}
