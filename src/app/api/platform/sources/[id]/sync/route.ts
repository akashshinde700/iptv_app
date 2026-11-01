import { db } from '@/lib/db'
import { audit, HttpError, platformRouteCtx } from '@/lib/server/auth'
import { syncPortal } from '@/lib/server/sync/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Import / refresh a source's channels (diffs against what it produced before). */
export const POST = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const portal = await db.portal.findUnique({ where: { id }, select: { isActive: true, expiresAt: true } })
  if (!portal) throw new HttpError(404, 'Source not found')
  if (!portal.isActive) throw new HttpError(400, 'Enable the source before syncing')
  if (portal.expiresAt && portal.expiresAt < new Date()) {
    throw new HttpError(400, `This source expired on ${portal.expiresAt.toISOString().slice(0, 10)} — update it before syncing`)
  }
  try {
    const result = await syncPortal(id)
    await audit({ adminId: admin.id, adminName: admin.username, action: 'SOURCE_SYNC', entityType: 'PORTAL', entityId: id, newValue: result, request })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    await audit({ adminId: admin.id, adminName: admin.username, action: 'SOURCE_SYNC_FAILED', entityType: 'PORTAL', entityId: id, newValue: { error: message }, request })
    throw new HttpError(502, message)
  }
})
