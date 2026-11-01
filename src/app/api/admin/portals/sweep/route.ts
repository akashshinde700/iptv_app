import { db } from '@/lib/db'
import { adminRouteCtx, audit } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/**
 * Validity sweep — marks every portal whose expiresAt has passed as EXPIRED.
 * Query-time guards already hide such sources' channels; this makes the admin
 * list reflect reality (red EXPIRED badge) in one click.
 */
export const POST = adminRouteCtx(async (request, _ctx, admin) => {
  const now = new Date()

  const expired = await db.portal.findMany({
    where: { organizationId: admin.organizationId, expiresAt: { lt: now }, status: { not: 'EXPIRED' } },
    select: { id: true, name: true, expiresAt: true },
  })

  let swept = 0
  for (const portal of expired) {
    await db.portal.update({
      where: { id: portal.id },
      data: {
        status: 'EXPIRED',
        lastError: `Validity ${portal.expiresAt?.toISOString().slice(0, 10)} ko khatam — auto-sweep`,
      },
    })
    swept += 1
  }

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PORTAL_VALIDITY_SWEEP',
    entityType: 'PORTAL',
    newValue: { swept, ids: expired.map((p) => p.id) },
    request,
  })

  return Response.json({ ok: true, swept, expired: expired.map((p) => ({ id: p.id, name: p.name })) })
})
