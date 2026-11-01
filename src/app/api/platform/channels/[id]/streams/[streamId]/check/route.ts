import { audit, platformRouteCtx } from '@/lib/server/auth'
import { probeStream } from '@/lib/server/failover'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Live health probe for one source (platform staff). Records the result; never touches the channel. */
export const POST = platformRouteCtx<{ id: string; streamId: string }>(async (request, { params }, admin) => {
  const { id, streamId } = await params
  const result = await probeStream(undefined, id, streamId)
  if (!result) return Response.json({ error: 'Source not found' }, { status: 404 })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'STREAM_CHECK',
    entityType: 'CHANNEL',
    entityId: id,
    newValue: { streamId, ...result },
    request,
  })
  return Response.json(result)
})
