import { db } from '@/lib/db'
import { adminRoute } from '@/lib/server/auth'
import { splitPipe } from '@/lib/server/iptv'

export const dynamic = 'force-dynamic'

function tally(values: (string | null | undefined)[]) {
  const map = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    map.set(value, (map.get(value) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
}

export const GET = adminRoute(async (_request, admin) => {
  const org = admin.organizationId
  const [
    totalChannels,
    activeChannels,
    adultChannels,
    portalChannels,
    totalCustomers,
    activeCustomers,
    inactiveCustomers,
    suspendedCustomers,
    expiredCustomers,
    totalPlans,
    activePlans,
    portals,
    customersWithPlan,
    allChannels,
    recentLogs,
  ] = await Promise.all([
    db.channel.count({ where: { organizationId: org } }),
    db.channel.count({ where: { organizationId: org, isActive: true } }),
    db.channel.count({ where: { organizationId: org, isNsfw: true } }),
    db.channel.count({ where: { organizationId: org, portalId: { not: null } } }),
    db.customer.count({ where: { organizationId: org } }),
    db.customer.count({ where: { organizationId: org, status: 'ACTIVE' } }),
    db.customer.count({ where: { organizationId: org, status: 'INACTIVE' } }),
    db.customer.count({ where: { organizationId: org, status: 'SUSPENDED' } }),
    db.customer.count({ where: { organizationId: org, status: 'EXPIRED' } }),
    db.plan.count({ where: { organizationId: org } }),
    db.plan.count({ where: { organizationId: org, isActive: true } }),
    db.portal.findMany({ where: { organizationId: org }, select: { type: true, status: true, lastSyncedAt: true, expiresAt: true } }),
    db.customer.count({ where: { organizationId: org, planId: { not: null } } }),
    db.channel.findMany({
      where: { organizationId: org },
      select: { region: true, country: true, countryName: true, languages: true, categories: true },
    }),
    db.auditLog.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'desc' }, take: 8 }),
  ])

  const languageTally = new Map<string, number>()
  const categoryTally = new Map<string, number>()
  const countryNames = new Map<string, string>()
  for (const channel of allChannels) {
    for (const lang of splitPipe(channel.languages)) {
      languageTally.set(lang, (languageTally.get(lang) ?? 0) + 1)
    }
    for (const cat of splitPipe(channel.categories)) {
      categoryTally.set(cat, (categoryTally.get(cat) ?? 0) + 1)
    }
    if (channel.country && channel.countryName) countryNames.set(channel.country, channel.countryName)
  }

  const portalTypeCounts = new Map<string, number>()
  for (const portal of portals) {
    portalTypeCounts.set(portal.type, (portalTypeCounts.get(portal.type) ?? 0) + 1)
  }

  return Response.json({
    channels: {
      total: totalChannels, // DYNAMIC — grows with every portal sync, never hardcoded
      active: activeChannels,
      adult: adultChannels,
      fromPortals: portalChannels,
    },
    customers: {
      total: totalCustomers,
      active: activeCustomers,
      inactive: inactiveCustomers,
      suspended: suspendedCustomers,
      expired: expiredCustomers,
      withPlan: customersWithPlan,
    },
    plans: { total: totalPlans, active: activePlans },
    portals: {
      total: portals.length,
      byType: [...portalTypeCounts.entries()].map(([type, count]) => ({ type, count })),
      needsAttention: portals.filter((p) => p.status === 'ERROR').length,
      lastSyncedAt: portals
        .map((p) => p.lastSyncedAt)
        .filter(Boolean)
        .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null,
    },
    breakdown: {
      byRegion: tally(allChannels.map((c) => c.region)),
      byCountry: tally(allChannels.map((c) => (c.country ? countryNames.get(c.country) ?? c.country : null))).slice(0, 20),
      byLanguage: tally([...languageTally.keys()]).slice(0, 20),
      byCategory: tally([...categoryTally.keys()]).slice(0, 20),
    },
    recentActivity: recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      adminName: log.adminName,
      entityType: log.entityType,
      createdAt: log.createdAt,
    })),
  })
})
