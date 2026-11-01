import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError, platformRoute } from '@/lib/server/auth'
import {
  backfillSubscriptions,
  createCustomer,
  readJson,
  type CustomerInput,
  type SubscriptionInput,
} from '@/lib/server/billing'
import { customerState, customerStateWhere, daysRemaining } from '@/lib/server/billing-rules'

export const dynamic = 'force-dynamic'

/** Platform console: customers across every organization (or one, with ?organizationId). */
export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId') || undefined
  const planId = sp.get('planId') || undefined
  const state = sp.get('state') || 'ALL'
  const search = sp.get('search')?.trim()
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get('pageSize') ?? '25', 10) || 25))
  const now = new Date()

  await backfillSubscriptions(organizationId ? { organizationId } : {})

  const where: Prisma.CustomerWhereInput = {
    AND: [
      organizationId ? { organizationId } : {},
      planId ? { planId } : {},
      customerStateWhere(state, now),
      search
        ? {
            OR: [
              { name: { contains: search } },
              { username: { contains: search } },
              { email: { contains: search } },
              { mobile: { contains: search } },
              { id: search },
            ],
          }
        : {},
    ],
  }

  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        mobile: true,
        status: true,
        accountStatus: true,
        planId: true,
        planStartedAt: true,
        planExpiresAt: true,
        lastLoginAt: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        plan: { select: { id: true, name: true, maxDevices: true } },
        _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
      },
    }),
  ])

  return Response.json({
    items: rows.map(({ _count, ...c }) => ({
      ...c,
      state: customerState(c, now),
      daysLeft: c.planExpiresAt ? daysRemaining(c.planExpiresAt, now) : null,
      devices: _count.sessions,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
})

/** Add a customer to an organization, optionally with a subscription right away. */
export const POST = platformRoute(async (request, admin) => {
  const body = await readJson<{
    organizationId?: string
    customer?: CustomerInput
    subscription?: SubscriptionInput | null
  }>(request)
  if (!body.organizationId) throw new HttpError(400, 'Choose an organization')
  const customer = await createCustomer(body.organizationId, body.customer ?? {}, admin, body.subscription ?? null, request)
  return Response.json({ id: customer.id }, { status: 201 })
})
