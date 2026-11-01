import { db } from '@/lib/db'
import { audit, destroyAllCustomerSessions, HttpError, platformRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

type Ctx = { id: string }

export const GET = platformRouteCtx<Ctx>(async (_request, { params }) => {
  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { id: true } })
  if (!customer) throw new HttpError(404, 'Customer not found')
  const items = await db.customerSession.findMany({
    where: { customerId: id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
  })
  return Response.json({ items })
})

/** Sign the customer out of every device. */
export const DELETE = platformRouteCtx<Ctx>(async (request, { params }, admin) => {
  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { id: true, organizationId: true } })
  if (!customer) throw new HttpError(404, 'Customer not found')
  const cleared = await destroyAllCustomerSessions(id)
  await audit({
    organizationId: customer.organizationId,
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
