import { db } from '@/lib/db'
import { platformRoute } from '@/lib/server/auth'
import { backfillSubscriptions } from '@/lib/server/billing'
import { addDays, customerStateWhere, subscriptionStateWhere } from '@/lib/server/billing-rules'

export const dynamic = 'force-dynamic'

/** Platform-wide totals for the StreamKaro operator dashboard (every card links to a filtered list). */
export const GET = platformRoute(async () => {
  await backfillSubscriptions()
  const now = new Date()
  const count = (state: string) => db.customer.count({ where: customerStateWhere(state, now) })

  const [
    totalOrgs,
    activeOrgs,
    trialOrgs,
    suspendedOrgs,
    totalCustomers,
    activeSubscribers,
    expiring7,
    expiring3,
    expired,
    suspended,
    pendingActivation,
    noSubscription,
    paymentPending,
    revenue30d,
    revenueTotal,
    totalChannels,
    totalPortals,
    byPlan,
    recent,
  ] = await Promise.all([
    db.organization.count(),
    db.organization.count({ where: { status: 'ACTIVE' } }),
    db.organization.count({ where: { status: 'TRIAL' } }),
    db.organization.count({ where: { status: 'SUSPENDED' } }),
    db.customer.count({ where: customerStateWhere('ALL', now) }),
    count('ACTIVE'),
    count('EXPIRING'),
    db.customer.count({
      where: { accountStatus: 'ACTIVE', status: 'ACTIVE', planId: { not: null }, planExpiresAt: { gt: now, lte: addDays(now, 3) } },
    }),
    count('EXPIRED'),
    count('SUSPENDED'),
    count('PENDING'),
    count('NO_SUBSCRIPTION'),
    db.subscription.count({ where: subscriptionStateWhere('PAYMENT_PENDING', now) }),
    db.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: addDays(now, -30) } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    db.channel.count(),
    db.portal.count(),
    db.organization.groupBy({ by: ['platformPlan'], _count: { _all: true } }),
    db.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, slug: true, name: true, status: true, platformPlan: true, createdAt: true },
    }),
  ])

  return Response.json({
    orgs: { total: totalOrgs, active: activeOrgs, trial: trialOrgs, suspended: suspendedOrgs },
    customers: { total: totalCustomers, active: activeSubscribers },
    subscribers: {
      active: activeSubscribers,
      expiring7,
      expiring3,
      expired,
      suspended,
      pending: pendingActivation,
      none: noSubscription,
    },
    payments: {
      pending: paymentPending,
      revenue30d: revenue30d._sum.amount ?? 0,
      revenueTotal: revenueTotal._sum.amount ?? 0,
    },
    channels: totalChannels,
    portals: totalPortals,
    byPlatformPlan: byPlan.map((r) => ({ plan: r.platformPlan, count: r._count._all })),
    recentOrgs: recent,
  })
})
