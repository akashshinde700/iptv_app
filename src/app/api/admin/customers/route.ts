import { db } from '@/lib/db'
import { adminRoute } from '@/lib/server/auth'
import { createCustomer, readJson, setAccountStatus, type CustomerInput } from '@/lib/server/billing'

export const dynamic = 'force-dynamic'

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  mobile: true,
  status: true,
  planId: true,
  planStartedAt: true,
  planExpiresAt: true,
  notes: true,
  lastLoginAt: true,
  createdAt: true,
  plan: { select: { id: true, name: true, price: true, durationDays: true, isActive: true } },
}

export const GET = adminRoute(async (request, admin) => {
  const { searchParams } = new URL(request.url)

  const search = searchParams.get('search')?.trim() || undefined
  const status = searchParams.get('status') || undefined
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '20', 10) || 20))

  const where = {
    organizationId: admin.organizationId,
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { username: { contains: search } },
            { email: { contains: search } },
            { mobile: { contains: search } },
          ],
        }
      : {}),
  }

  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: CUSTOMER_SELECT,
    }),
  ])

  return Response.json({ items: customers, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
})

/** Create a customer in the admin's organization (a plan creates a subscription record). */
export const POST = adminRoute(async (request, admin) => {
  const body = await readJson<CustomerInput & { status?: string; planId?: string | null }>(request)
  const created = await createCustomer(
    admin.organizationId,
    body,
    admin,
    body.planId ? { planId: body.planId } : null,
    request,
  )
  if (body.status === 'SUSPENDED') {
    await setAccountStatus(created.id, { organizationId: admin.organizationId }, 'SUSPENDED', admin, request)
  }
  const customer = await db.customer.findUnique({ where: { id: created.id }, select: CUSTOMER_SELECT })
  return Response.json(customer, { status: 201 })
})
