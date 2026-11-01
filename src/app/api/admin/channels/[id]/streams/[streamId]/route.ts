import { db } from '@/lib/db'
import { adminRouteCtx, audit } from '@/lib/server/auth'
import { assertPublicSourceUrl } from '@/lib/server/net-guard'

export const dynamic = 'force-dynamic'

/**
 * Manage one source of a channel: set its priority (failover order), enable/disable it,
 * reset its failure streak, or edit a manual source's URL/labels. Disabling a source
 * never removes the channel — it just drops that source out of the failover order.
 */
export const PATCH = adminRouteCtx(async (request, { params }, admin) => {
  const { id, streamId } = await params

  const stream = await db.stream.findFirst({
    where: { id: streamId, channelId: id, channel: { organizationId: admin.organizationId } },
    select: { id: true, status: true, priority: true, failureCount: true, portalId: true },
  })
  if (!stream) return Response.json({ error: 'Source nahi mila' }, { status: 404 })

  let body: {
    priority?: number
    status?: string
    resetHealth?: boolean
    url?: string
    title?: string
    quality?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (body.priority !== undefined) {
    let priority = Number(body.priority)
    if (!Number.isFinite(priority)) return Response.json({ error: 'priority must be a number' }, { status: 400 })
    priority = Math.max(0, Math.min(1000, Math.floor(priority)))
    data.priority = priority
  }

  if (body.status !== undefined) {
    const next = body.status.toUpperCase()
    if (next !== 'ACTIVE' && next !== 'DISABLED') {
      return Response.json({ error: "status must be ACTIVE or DISABLED" }, { status: 400 })
    }
    data.status = next
    // Re-enabling a source gives it a clean slate so it isn't re-disabled on the first hiccup.
    if (next === 'ACTIVE') {
      data.failureCount = 0
      data.lastError = null
    }
  }

  // Explicit "reset health" clears the failure streak and reactivates the source.
  if (body.resetHealth) {
    data.status = 'ACTIVE'
    data.failureCount = 0
    data.lastError = null
    data.lastFailureAt = null
  }

  // Only manual (non-portal) sources may have their URL/labels edited — a portal owns its own.
  if (body.url !== undefined) {
    if (stream.portalId !== null) {
      return Response.json({ error: 'Portal-synced source ka URL edit nahi kar sakte' }, { status: 400 })
    }
    try {
      assertPublicSourceUrl(body.url, 'Stream URL')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid Stream URL'
      return Response.json({ error: message }, { status: 400 })
    }
    data.url = body.url.trim()
  }
  if (body.title !== undefined) data.title = body.title.trim() || null
  if (body.quality !== undefined) data.quality = body.quality.trim() || null

  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'Kuch update karne ko nahi hai' }, { status: 400 })
  }

  await db.stream.update({ where: { id: streamId }, data })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'STREAM_EDIT',
    entityType: 'CHANNEL',
    entityId: id,
    oldValue: { streamId, status: stream.status, priority: stream.priority, failureCount: stream.failureCount },
    newValue: { streamId, ...data },
    request,
  })

  return Response.json({ ok: true })
})

/** Remove a source from a channel (the channel and its other sources stay). */
export const DELETE = adminRouteCtx(async (request, { params }, admin) => {
  const { id, streamId } = await params

  const stream = await db.stream.findFirst({
    where: { id: streamId, channelId: id, channel: { organizationId: admin.organizationId } },
    select: { id: true, title: true, portalId: true },
  })
  if (!stream) return Response.json({ error: 'Source nahi mila' }, { status: 404 })

  // Guard against emptying a channel: never let the last source be deleted.
  const total = await db.stream.count({ where: { channelId: id } })
  if (total <= 1) {
    return Response.json({ error: 'Yeh channel ka aakhri source hai — delete nahi kar sakte' }, { status: 400 })
  }

  await db.stream.delete({ where: { id: streamId } })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'STREAM_DELETE',
    entityType: 'CHANNEL',
    entityId: id,
    oldValue: { streamId, title: stream.title, manual: stream.portalId === null },
    request,
  })

  return Response.json({ ok: true })
})
