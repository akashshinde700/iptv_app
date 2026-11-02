import { db } from '@/lib/db'
import { audit, adminRouteCtx, HttpError } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/**
 * Restore an auto-hidden channel by hand. It goes back into the catalog immediately; if its
 * sources are still dead the doctor will hide it again after the next sweep (which is the
 * intended behaviour — this is an override, not a permanent "keep broken channels visible").
 */
export const POST = adminRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const channel = await db.channel.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { id: true, name: true },
  })
  if (!channel) throw new HttpError(404, 'Channel not found')

  await db.channel.update({
    where: { id },
    data: { isActive: true, autoHiddenAt: null, healthStatus: 'UNKNOWN' },
  })
  // Re-enable the sources too, otherwise `servableChannelClause` (at least one non-disabled
  // stream) would keep the channel out of the catalog and the restore would look like a no-op.
  // Sources the operator switched off on purpose stay off (BUG-07); only auto-disabled ones return.
  await db.stream.updateMany({
    where: { channelId: id, OR: [{ disabledBy: null }, { disabledBy: { not: 'OPERATOR' } }] },
    data: { failureCount: 0, status: 'ACTIVE', disabledBy: null },
  })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'CHANNEL_RESTORED',
    entityType: 'CHANNEL',
    entityId: id,
    newValue: { name: channel.name },
    request,
  })
  return Response.json({ ok: true })
})
