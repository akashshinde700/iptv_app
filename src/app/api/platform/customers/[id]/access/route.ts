import { db } from '@/lib/db'
import { computeAccessSummary } from '@/lib/server/access'
import { HttpError, platformRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** What the access engine grants this customer right now (same engine the player uses). */
export const GET = platformRouteCtx<{ id: string }>(async (_request, { params }) => {
  const { id } = await params
  const exists = await db.customer.findUnique({ where: { id }, select: { id: true } })
  if (!exists) throw new HttpError(404, 'Customer not found')
  const summary = await computeAccessSummary(id)
  return Response.json({
    total: summary.total,
    hasAccess: summary.state.hasAccess,
    reason: summary.state.reason,
    planName: summary.state.planName,
    allowAdult: summary.state.allowAdult,
    rules: {
      regions: summary.state.regions,
      countries: summary.state.countries,
      languages: summary.state.languages,
      categories: summary.state.categories,
    },
    byCategory: summary.byCategory.slice(0, 12),
    byLanguage: summary.byLanguage.slice(0, 12),
    byCountry: summary.byCountry.slice(0, 12),
  })
})
