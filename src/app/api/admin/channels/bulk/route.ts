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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // BUG-12: the id list came straight from the client with no bound. A huge array meant one
  // request could push a multi-megabyte `IN (…)` clause into MySQL (and a giant AuditLog row).
  // The UI selects a page at a time (100 max), so 500 is generous.
  const MAX_BULK_IDS = 500
  const rawIds = Array.isArray(body.ids) ? body.ids : []
  if (rawIds.length > MAX_BULK_IDS) {
    return Response.json(
      { error: `Ek baar me maximum ${MAX_BULK_IDS} channels — selection chhota karo` },
      { status: 400 },
    )
  }
  const ids = rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 40)
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
