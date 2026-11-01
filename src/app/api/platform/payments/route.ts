import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { platformRoute } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

function dateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined
  const date = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId') || undefined
  const status = sp.get('status') || 'ALL'
  const search = sp.get('search')?.trim()
  const from = dateParam(sp.get('from'))
  const to = dateParam(sp.get('to'), true)
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get('pageSize') ?? '25', 10) || 25))

  const where: Prisma.PaymentWhereInput = {
    AND: [
      organizationId ? { organizationId } : {},
      status !== 'ALL' ? { status } : {},
      from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {},
      search
        ? {
            OR: [
              { id: search },
              { reference: { contains: search } },
              { customer: { OR: [{ name: { contains: search } }, { username: { contains: search } }] } },
            ],
          }
        : {},
    ],
  }

  const [total, rows, paid] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, username: true } },
        organization: { select: { id: true, name: true } },
        subscription: { select: { id: true, planName: true } },
      },
    }),
    db.payment.aggregate({ where: { AND: [where, { status: 'PAID' }] }, _sum: { amount: true } }),
  ])

  return Response.json({
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    paidTotal: paid._sum.amount ?? 0,
  })
})
