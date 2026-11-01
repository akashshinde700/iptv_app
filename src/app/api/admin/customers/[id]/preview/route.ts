import { db } from '@/lib/db'
import { computeAccessSummary } from '@/lib/server/access'
import { adminRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** "Customer will receive: N channels + breakdown" — preview before assignment. */
export const GET = adminRouteCtx(async (_request, { params }, admin) => {
  const { id } = await params
  const owned = await db.customer.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { id: true },
  })
  if (!owned) return Response.json({ error: 'Customer nahi mila' }, { status: 404 })
  const summary = await computeAccessSummary(id)
  return Response.json({
    total: summary.total,
    state: {
      hasAccess: summary.state.hasAccess,
      reason: summary.state.reason,
      planName: summary.state.planName,
      allowAdult: summary.state.allowAdult,
      regions: summary.state.regions,
      countries: summary.state.countries,
      languages: summary.state.languages,
      categories: summary.state.categories,
    },
    breakdown: {
      byRegion: summary.byRegion.slice(0, 12),
      byCountry: summary.byCountry.slice(0, 12),
      byLanguage: summary.byLanguage.slice(0, 12),
      byCategory: summary.byCategory.slice(0, 12),
    },
  })
})
