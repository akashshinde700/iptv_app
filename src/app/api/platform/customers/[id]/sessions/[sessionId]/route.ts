import { db } from '@/lib/db'
import { audit, HttpError, platformRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Revoke one device session. */
export const DELETE = platformRouteCtx<{ id: string; sessionId: string }>(async (request, { params }, admin) => {
  const { id, sessionId } = await params
  const session = await db.customerSession.findFirst({
    where: { id: sessionId, customerId: id },
    select: { id: true, userAgent: true, customer: { select: { organizationId: true } } },
  })
  if (!session) throw new HttpError(404, 'Device session not found')
  await db.customerSession.delete({ where: { id: sessionId } })
  await audit({
    organizationId: session.customer.organizationId,
    adminId: admin.id,
    adminName: admin.username,
    action: 'CUSTOMER_DEVICE_REVOKE',
    entityType: 'CUSTOMER',
    entityId: id,
    oldValue: { sessionId, device: session.userAgent?.slice(0, 120) ?? null },
    request,
  })
  return Response.json({ ok: true })
})
