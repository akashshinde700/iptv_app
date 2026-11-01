import { db } from '@/lib/db'
import { adminRoute, audit } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Bulk actions on selected channels: activate / deactivate / delete. */
export const POST = adminRoute(async (request, admin) => {
  let body: { ids?: string[]; action?: 'activate' | 'deactivate' | 'delete' }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const ids = (body.ids ?? []).filter(Boolean)
  if (ids.length === 0) return Response.json({ error: 'Kam se kam ek channel select karo' }, { status: 400 })
  if (!['activate', 'deactivate', 'delete'].includes(body.action ?? '')) {
    return Response.json({ error: 'Invalid action' }, { status: 400 })
  }

  const scope = { id: { in: ids }, organizationId: admin.organizationId }
  let affected = 0
  if (body.action === 'delete') {
    const result = await db.channel.deleteMany({ where: scope })
    affected = result.count
  } else {
    const result = await db.channel.updateMany({
      where: scope,
      data: { isActive: body.action === 'activate' },
    })
    affected = result.count
  }

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: `CHANNELS_BULK_${(body.action ?? '').toUpperCase()}`,
    entityType: 'CHANNEL',
    newValue: { count: affected, ids: ids.slice(0, 50) },
    request,
  })

  return Response.json({ ok: true, affected })
})
