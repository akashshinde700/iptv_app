import { db } from '@/lib/db'
import { audit, HttpError, platformRouteCtx } from '@/lib/server/auth'
import { readJson } from '@/lib/server/billing'
import { channelIdentityKey } from '@/lib/server/iptv'

export const dynamic = 'force-dynamic'

/** Resolve every portal row of the LOGICAL channel `id` belongs to (same identityKey). */
async function logicalChannelIds(id: string): Promise<{ organizationId: string; name: string; ids: string[] } | null> {
  const channel = await db.channel.findUnique({ where: { id }, select: { id: true, name: true, identityKey: true, organizationId: true } })
  if (!channel) return null
  const key = channel.identityKey ?? channelIdentityKey(channel.name)
  const rows = await db.channel.findMany({ where: { organizationId: channel.organizationId, identityKey: key }, select: { id: true } })
  const ids = rows.length ? rows.map((r) => r.id) : [channel.id]
  return { organizationId: channel.organizationId, name: channel.name, ids }
}

/**
 * Disable / enable a whole channel. Disabling turns every source of the logical channel OFF
 * so it disappears from the customer catalog (servableChannelClause); enabling brings it back
 * and clears the failure streak.
 */
export const PATCH = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const target = await logicalChannelIds(id)
  if (!target) throw new HttpError(404, 'Channel not found')

  const body = await readJson<{ action?: string }>(request)
  const action = body.action
  if (action === 'disable') {
    await db.stream.updateMany({ where: { channelId: { in: target.ids } }, data: { status: 'DISABLED', lastError: 'Disabled by operator' } })
  } else if (action === 'enable') {
    await db.stream.updateMany({ where: { channelId: { in: target.ids } }, data: { status: 'ACTIVE', failureCount: 0, lastError: null } })
  } else {
    throw new HttpError(400, "action must be 'disable' or 'enable'")
  }

  await audit({
    organizationId: target.organizationId,
    adminId: admin.id,
    adminName: admin.username,
    action: action === 'disable' ? 'CHANNEL_DISABLE' : 'CHANNEL_ENABLE',
    entityType: 'CHANNEL',
    entityId: id,
    newValue: { name: target.name, rows: target.ids.length },
    request,
  })
  return Response.json({ ok: true, affected: target.ids.length })
})

/** Delete a whole channel (every portal row of the logical channel + its sources cascade). */
export const DELETE = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const target = await logicalChannelIds(id)
  if (!target) throw new HttpError(404, 'Channel not found')

  const del = await db.channel.deleteMany({ where: { id: { in: target.ids } } })
  await audit({
    organizationId: target.organizationId,
    adminId: admin.id,
    adminName: admin.username,
    action: 'CHANNEL_DELETE',
    entityType: 'CHANNEL',
    entityId: id,
    oldValue: { name: target.name, rows: target.ids.length },
    request,
  })
  return Response.json({ ok: true, deleted: del.count })
})
