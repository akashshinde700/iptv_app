import { db } from '@/lib/db'
import { getCustomer } from '@/lib/server/auth'
import { evaluateAccess } from '@/lib/server/access'

export const dynamic = 'force-dynamic'

/** Current customer session + plan status + server-side access verdict. */
export async function GET(request: Request) {
  const identity = await getCustomer(request)
  if (!identity) return Response.json({ customer: null, access: { hasAccess: false, reason: 'guest' } })

  const customer = await db.customer.findUnique({
    where: { id: identity.id },
    include: { plan: true },
  })
  if (!customer) return Response.json({ customer: null, access: { hasAccess: false, reason: 'guest' } })

  // single source of truth: the access engine (also lazily syncs EXPIRED status)
  const access = await evaluateAccess(customer.id)

  const now = new Date()
  const expired = customer.planExpiresAt ? customer.planExpiresAt < now : false
  const effectiveStatus = expired && customer.status === 'ACTIVE' ? 'EXPIRED' : customer.status

  return Response.json({
    customer: {
      id: customer.id,
      username: customer.username,
      name: customer.name,
      email: customer.email,
      status: effectiveStatus,
      plan: customer.plan
        ? {
            id: customer.plan.id,
            name: customer.plan.name,
            price: customer.plan.price,
            allowAdult: customer.plan.allowAdult,
            maxDevices: customer.plan.maxDevices,
          }
        : null,
      planStartedAt: customer.planStartedAt,
      planExpiresAt: customer.planExpiresAt,
      expired,
    },
    access: { hasAccess: access.hasAccess, reason: access.reason },
  })
}
