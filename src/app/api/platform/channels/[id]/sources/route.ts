import { platformRouteCtx } from '@/lib/server/auth'
import { getChannelSources } from '@/lib/server/failover'

export const dynamic = 'force-dynamic'

/** All sources of a logical channel (aggregated across portals) — platform staff, any org. */
export const GET = platformRouteCtx<{ id: string }>(async (_request, { params }) => {
  const { id } = await params
  const result = await getChannelSources(undefined, id)
  if (!result) return Response.json({ error: 'Channel not found' }, { status: 404 })
  return Response.json(result)
})
