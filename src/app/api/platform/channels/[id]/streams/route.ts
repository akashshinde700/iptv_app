import { db } from '@/lib/db'
import { audit, platformRouteCtx } from '@/lib/server/auth'
import { assertPublicSourceUrl } from '@/lib/server/net-guard'

export const dynamic = 'force-dynamic'

/** Add a manual fallback source to a channel (portalId stays null so resyncs leave it alone). */
export const POST = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const channel = await db.channel.findUnique({ where: { id }, select: { id: true } })
  if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 })

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
    return Response.json({ error: err instanceof Error ? err.message : 'Invalid Stream URL' }, { status: 400 })
  }

  let priority = Number(body.priority)
  if (!Number.isFinite(priority)) priority = 50
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
    adminId: admin.id, adminName: admin.username, action: 'STREAM_ADD', entityType: 'CHANNEL', entityId: id,
    newValue: { streamId: stream.id, priority, title: body.title ?? null }, request,
  })
  return Response.json({ ok: true, streamId: stream.id })
})
