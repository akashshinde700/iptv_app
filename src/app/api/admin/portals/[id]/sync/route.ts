import { db } from '@/lib/db'
import { adminRouteCtx, audit, HttpError } from '@/lib/server/auth'
import { syncPortal } from '@/lib/server/sync/engine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Sync Now — fetch playlist, diff against DB, add/update/deactivate channels. */
export const POST = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  const portal = await db.portal.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { isActive: true, name: true, expiresAt: true },
  })
  if (!portal) throw new HttpError(404, 'Portal nahi mila')
  if (!portal.isActive) {
    throw new HttpError(400, 'Portal inactive hai — pehle Power button se activate karo, phir sync karo')
  }
  // Validity gate: sources past their expiry never sync — "validity ke hisab se".
  if (portal.expiresAt && portal.expiresAt < new Date()) {
    throw new HttpError(
      400,
      `Source ki validity ${portal.expiresAt.toISOString().slice(0, 10)} ko khatam ho gayi — sync allowed nahi. Sweep/Validity Check chalao ya expiry update karo.`
    )
  }
  try {
    const result = await syncPortal(id)
    await audit({
      adminId: admin.id,
      adminName: admin.username,
      action: 'PORTAL_SYNC',
      entityType: 'PORTAL',
      entityId: id,
      newValue: result,
      request,
    })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    await audit({
      adminId: admin.id,
      adminName: admin.username,
      action: 'PORTAL_SYNC_FAILED',
      entityType: 'PORTAL',
      entityId: id,
      newValue: { error: message },
      request,
    })
    throw new HttpError(502, `Sync fail: ${message}`)
  }
})
