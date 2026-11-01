import { adminRouteCtx } from '@/lib/server/auth'
import { healthSnapshot } from '@/lib/server/health-doctor'

export const dynamic = 'force-dynamic'

/** Health summary for the admin "Auto-fix" panel: how much of the catalog actually plays. */
export const GET = adminRouteCtx(async (_request, _ctx, admin) => {
  const snapshot = await healthSnapshot(admin.organizationId)
  return Response.json(snapshot)
})
