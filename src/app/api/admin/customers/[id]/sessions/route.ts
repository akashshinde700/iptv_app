import { db } from '@/lib/db'
import { adminRouteCtx, audit, destroyAllCustomerSessions } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** List a customer's active devices. */
export const GET = adminRouteCtx(async (_request, { params }, admin) => {
  const { id } = await params
  const customer = await db.customer.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { id: true },
  })
  if (!customer) return Response.json({ error: 'Customer nahi mila' }, { status: 404 })

  const sessions = await db.customerSession.findMany({
    where: { customerId: id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, ip: true, userAgent: true, createdAt: true },
  })
  return Response.json({ items: sessions })
})

/** Force-logout every device for this customer. */
export const DELETE = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  const customer = await db.customer.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { id: true, username: true },
  })
  if (!customer) return Response.json({ error: 'Customer nahi mila' }, { status: 404 })

  const cleared = await destroyAllCustomerSessions(id)
  await audit({
    organizationId: admin.organizationId,
    adminId: admin.id,
    adminName: admin.username,
    action: 'CUSTOMER_LOGOUT_DEVICES',
    entityType: 'CUSTOMER',
    entityId: id,
    newValue: { cleared },
    request,
  })
  return Response.json({ ok: true, cleared })
})
