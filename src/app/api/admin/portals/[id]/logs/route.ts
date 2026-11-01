import { db } from '@/lib/db'
import { adminRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Sync history for one portal. */
export const GET = adminRouteCtx(async (_request, { params }, admin) => {
  const { id } = await params
  const portal = await db.portal.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { id: true },
  })
  if (!portal) return Response.json({ error: 'Portal nahi mila' }, { status: 404 })

  const logs = await db.syncLog.findMany({
    where: { portalId: id },
    orderBy: { startedAt: 'desc' },
    take: 20,
  })
  return Response.json({ items: logs })
})
