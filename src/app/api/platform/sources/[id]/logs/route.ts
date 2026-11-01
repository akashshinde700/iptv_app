import { db } from '@/lib/db'
import { HttpError, platformRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Full sync history for one source. */
export const GET = platformRouteCtx<{ id: string }>(async (request, { params }) => {
  const { id } = await params
  const portal = await db.portal.findUnique({ where: { id }, select: { id: true } })
  if (!portal) throw new HttpError(404, 'Source not found')
  const sp = new URL(request.url).searchParams
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = 20
  const [total, items] = await Promise.all([
    db.syncLog.count({ where: { portalId: id } }),
    db.syncLog.findMany({ where: { portalId: id }, orderBy: { startedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ])
  return Response.json({ items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
})
