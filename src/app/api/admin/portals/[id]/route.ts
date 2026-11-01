import { db } from '@/lib/db'
import { adminRouteCtx, audit } from '@/lib/server/auth'
import { encryptSecret } from '@/lib/server/crypto'

export const dynamic = 'force-dynamic'

export const PATCH = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params

  const portal = await db.portal.findFirst({ where: { id, organizationId: admin.organizationId } })
  if (!portal) return Response.json({ error: 'Portal nahi mila' }, { status: 404 })

  let body: {
    name?: string
    url?: string
    macAddress?: string
    username?: string
    password?: string
    epgUrl?: string
    notes?: string
    isActive?: boolean
    fileData?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.url !== undefined) data.url = body.url?.trim() || null
  if (body.macAddress !== undefined) data.macAddress = body.macAddress?.trim().toUpperCase() || null
  if (body.username !== undefined) data.username = body.username?.trim() || null
  if (body.password !== undefined) data.password = encryptSecret(body.password?.trim() || null)
  if (body.epgUrl !== undefined) data.epgUrl = body.epgUrl?.trim() || null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null
  if (body.fileData !== undefined) data.fileData = body.fileData

  let auditAction = 'PORTAL_UPDATE'
  if (body.isActive !== undefined && body.isActive !== portal.isActive) {
    auditAction = body.isActive ? 'PORTAL_ACTIVATE' : 'PORTAL_DEACTIVATE'
    data.isActive = body.isActive
    data.status = body.isActive ? 'PENDING' : 'INACTIVE'
  }

  const updated = await db.portal.update({ where: { id }, data })

  // Portal toggle is the master switch for its channels — propagate so public
  // APIs (which filter on Channel.isActive) hide/show them instantly.
  if (body.isActive !== undefined && body.isActive !== portal.isActive) {
    await db.channel.updateMany({ where: { portalId: id }, data: { isActive: body.isActive } })
  }

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: auditAction,
    entityType: 'PORTAL',
    entityId: id,
    oldValue: { name: portal.name, isActive: portal.isActive },
    newValue: { name: updated.name, isActive: updated.isActive },
    request,
  })

  return Response.json({ ok: true, portal: { id: updated.id, name: updated.name, isActive: updated.isActive, status: updated.status } })
})

export const DELETE = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params

  const portal = await db.portal.findFirst({ where: { id, organizationId: admin.organizationId } })
  if (!portal) return Response.json({ error: 'Portal nahi mila' }, { status: 404 })

  await db.portal.delete({ where: { id } }) // channels cascade-delete
  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PORTAL_DELETE',
    entityType: 'PORTAL',
    entityId: id,
    oldValue: { name: portal.name, type: portal.type },
    request,
  })
  return Response.json({ ok: true })
})
