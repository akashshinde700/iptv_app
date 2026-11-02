import { db } from '@/lib/db'
import { adminRouteCtx, audit } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Edit channel metadata / activate / deactivate. */
export const PATCH = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params

  const channel = await db.channel.findFirst({ where: { id, organizationId: admin.organizationId } })
  if (!channel) return Response.json({ error: 'Channel nahi mila' }, { status: 404 })

  let body: {
    name?: string
    categories?: string[]
    languages?: string[]
    region?: string
    isNsfw?: boolean
    isActive?: boolean
    isDemo?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined && body.name.trim()) data.name = body.name.trim()
  if (body.categories !== undefined) {
    const clean = body.categories.map((c) => c.trim()).filter(Boolean)
    data.categories = clean.length > 0 ? `|${clean.join('|')}|` : '|'
  }
  if (body.languages !== undefined) {
    const clean = body.languages.map((l) => l.trim()).filter(Boolean)
    data.languages = clean.length > 0 ? `|${clean.join('|')}|` : '|'
  }
  if (body.region !== undefined) data.region = body.region || null
  if (body.isNsfw !== undefined) data.isNsfw = body.isNsfw
  if (body.isActive !== undefined) data.isActive = body.isActive
  if (body.isDemo !== undefined) data.isDemo = body.isDemo

  const updated = await db.channel.update({ where: { id }, data })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action:
      body.isActive !== undefined && body.isActive !== channel.isActive
        ? body.isActive
          ? 'CHANNEL_ACTIVATE'
          : 'CHANNEL_DEACTIVATE'
        : 'CHANNEL_EDIT',
    entityType: 'CHANNEL',
    entityId: id,
    oldValue: { name: channel.name, isActive: channel.isActive, isNsfw: channel.isNsfw, isDemo: channel.isDemo },
    newValue: { name: updated.name, isActive: updated.isActive, isNsfw: updated.isNsfw, isDemo: updated.isDemo },
    request,
  })

  return Response.json({ ok: true, channel: { id: updated.id, name: updated.name, isActive: updated.isActive } })
})

export const DELETE = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params

  const channel = await db.channel.findFirst({ where: { id, organizationId: admin.organizationId } })
  if (!channel) return Response.json({ error: 'Channel nahi mila' }, { status: 404 })

  await db.channel.delete({ where: { id } })
  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'CHANNEL_DELETE',
    entityType: 'CHANNEL',
    entityId: id,
    oldValue: { name: channel.name },
    request,
  })
  return Response.json({ ok: true })
})
