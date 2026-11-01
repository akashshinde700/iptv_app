import { db } from '@/lib/db'
import { adminRoute } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export const GET = adminRoute(async (request, admin) => {
  const { searchParams } = new URL(request.url)

  const action = searchParams.get('action') || undefined
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '30', 10) || 30))

  const where = {
    organizationId: admin.organizationId,
    ...(action && action !== 'ALL' ? { action } : {}),
  }

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return Response.json({ items: logs, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
})
