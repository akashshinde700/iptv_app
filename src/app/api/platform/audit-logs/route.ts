import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { platformRoute } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId') || undefined
  // a customer's activity spans the customer, its subscriptions and its payments
  const entityIds = (sp.get('entityIds') ?? sp.get('entityId') ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  const action = sp.get('action') || undefined
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get('pageSize') ?? '30', 10) || 30))

  const where: Prisma.AuditLogWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(entityIds.length > 0 ? { entityId: { in: entityIds.slice(0, 200) } } : {}),
    ...(action && action !== 'ALL' ? { action: { startsWith: action } } : {}),
  }
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { organization: { select: { id: true, name: true } } },
    }),
  ])
  return Response.json({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
})
