import { adminRouteCtx, audit } from '@/lib/server/auth'
import { probeStream } from '@/lib/server/failover'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Live health probe for one source — records the result and never touches the channel. */
export const POST = adminRouteCtx(async (request, { params }, admin) => {
  const { id, streamId } = await params
  const result = await probeStream(admin.organizationId, id, streamId)
  if (!result) return Response.json({ error: 'Source nahi mila' }, { status: 404 })

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
