import { db } from '@/lib/db'
import { adminRouteCtx, audit } from '@/lib/server/auth'
import { assertPublicSourceUrl } from '@/lib/server/net-guard'

export const dynamic = 'force-dynamic'

/**
 * Per-channel source management for multi-source failover.
 *
 * A channel keeps MANY streams (sources); the player fails over between them and the
 * server auto-disables a consistently-dead source — never the channel. Here the admin
 * can review every source's health/priority and add a manual fallback source.
 */
export const GET = adminRouteCtx(async (_request, { params }, admin) => {
  const { id } = await params
  const channel = await db.channel.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { id: true, name: true },
  })
  if (!channel) return Response.json({ error: 'Channel nahi mila' }, { status: 404 })

  const streams = await db.stream.findMany({
    where: { channelId: id },
    orderBy: [{ status: 'asc' }, { priority: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      url: true,
      title: true,
      quality: true,
      priority: true,
      status: true,
      failureCount: true,
      lastFailureAt: true,
      lastOkAt: true,
      lastError: true,
      portalId: true,
      portal: { select: { id: true, name: true } },
    },
  })

  return Response.json({
    channel: { id: channel.id, name: channel.name },
    streams: streams.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      quality: s.quality,
      priority: s.priority,
      status: s.status,
      failureCount: s.failureCount,
      lastFailureAt: s.lastFailureAt,
      lastOkAt: s.lastOkAt,
      lastError: s.lastError,
      // Portal-synced vs. manually-added fallback (a portal resync never touches manual ones).
      source: s.portal ? { id: s.portal.id, name: s.portal.name } : null,
      manual: s.portalId === null,
    })),
  })
})

/** Add a manual fallback source to a channel (portalId stays null so resyncs leave it alone). */
export const POST = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  const channel = await db.channel.findFirst({
    where: { id, organizationId: admin.organizationId },
    select: { id: true, name: true },
  })
  if (!channel) return Response.json({ error: 'Channel nahi mila' }, { status: 404 })

  let body: { url?: string; title?: string; quality?: string; priority?: number; referrer?: string; userAgent?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const url = body.url?.trim()
  try {
    assertPublicSourceUrl(url, 'Stream URL')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid Stream URL'
    return Response.json({ error: message }, { status: 400 })
  }

  let priority = Number(body.priority)
  if (!Number.isFinite(priority)) priority = 50 // fallbacks default ahead of the 100 portal streams get
  priority = Math.max(0, Math.min(1000, Math.floor(priority)))

  const stream = await db.stream.create({
    data: {
      channelId: id,
      url: url!,
      title: body.title?.trim() || null,
      quality: body.quality?.trim() || null,
      referrer: body.referrer?.trim() || null,
      userAgent: body.userAgent?.trim() || null,
      priority,
      status: 'ACTIVE',
    },
    select: { id: true },
  })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'STREAM_ADD',
    entityType: 'CHANNEL',
    entityId: id,
    newValue: { streamId: stream.id, priority, title: body.title ?? null },
    request,
  })

  return Response.json({ ok: true, streamId: stream.id })
})
