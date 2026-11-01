import { adminRouteCtx } from '@/lib/server/auth'
import { getChannelSources } from '@/lib/server/failover'

export const dynamic = 'force-dynamic'

/** All sources of a logical channel (aggregated across portals) for the failover manager. */
export const GET = adminRouteCtx(async (_request, { params }, admin) => {
  const { id } = await params
  const result = await getChannelSources(admin.organizationId, id)
  if (!result) return Response.json({ error: 'Channel nahi mila' }, { status: 404 })
  return Response.json(result)
})
