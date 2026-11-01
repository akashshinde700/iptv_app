import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { platformRoute } from '@/lib/server/auth'
import { backfillSubscriptions } from '@/lib/server/billing'
import { daysRemaining, subscriptionState, subscriptionStateWhere } from '@/lib/server/billing-rules'

export const dynamic = 'force-dynamic'

function dateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined
  const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Subscriptions across organizations — filter by state, plan, org, customer and end-date range. */
export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId') || undefined
  const planId = sp.get('planId') || undefined
  const state = sp.get('state') || 'ALL'
  const search = sp.get('search')?.trim()
  const from = dateParam(sp.get('from'))
  const to = dateParam(sp.get('to'), true)
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get('pageSize') ?? '25', 10) || 25))
  const now = new Date()

  await backfillSubscriptions(organizationId ? { organizationId } : {})

  const where: Prisma.SubscriptionWhereInput = {
    AND: [
      organizationId ? { organizationId } : {},
      planId ? { planId } : {},
      subscriptionStateWhere(state, now),
      from || to ? { endsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {},
      search
        ? {
            customer: {
              OR: [{ name: { contains: search } }, { username: { contains: search } }, { email: { contains: search } }],
            },
          }
        : {},
    ],
  }

  const [total, rows] = await Promise.all([
    db.subscription.count({ where }),
    db.subscription.findMany({
      where,
      orderBy: [{ endsAt: state === 'EXPIRING' ? 'asc' : 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, username: true } },
        organization: { select: { id: true, name: true } },
      },
    }),
  ])

  return Response.json({
    items: rows.map((s) => ({ ...s, state: subscriptionState(s, now), daysLeft: daysRemaining(s.endsAt, now) })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
})
