import { db } from '@/lib/db'
import { adminRouteCtx, audit } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Manual channel override: allow outside plan rules, or block inside them. */
export const POST = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params

  let body: { channelId?: string; allow?: boolean }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.channelId) return Response.json({ error: 'channelId zaroori hai' }, { status: 400 })

  // Both customer and channel must belong to this admin's organization.
  const [customer, channel] = await Promise.all([
    db.customer.findFirst({ where: { id, organizationId: admin.organizationId }, select: { id: true } }),
    db.channel.findFirst({ where: { id: body.channelId, organizationId: admin.organizationId } }),
  ])
  if (!customer) return Response.json({ error: 'Customer nahi mila' }, { status: 404 })
  if (!channel) return Response.json({ error: 'Channel nahi mila' }, { status: 404 })

  await db.customerOverride.upsert({
    where: { customerId_channelId: { customerId: id, channelId: body.channelId } },
    create: { customerId: id, channelId: body.channelId, allow: body.allow ?? true },
    update: { allow: body.allow ?? true },
  })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: body.allow === false ? 'CHANNEL_OVERRIDE_BLOCK' : 'CHANNEL_OVERRIDE_ALLOW',
    entityType: 'CUSTOMER',
    entityId: id,
    newValue: { channelId: body.channelId, channel: channel.name },
    request,
  })

  return Response.json({ ok: true })
})

export const DELETE = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  const channelId = new URL(request.url).searchParams.get('channelId')
  if (!channelId) return Response.json({ error: 'channelId zaroori hai' }, { status: 400 })

  const owned = await db.customer.findFirst({ where: { id, organizationId: admin.organizationId }, select: { id: true } })
  if (!owned) return Response.json({ error: 'Customer nahi mila' }, { status: 404 })

  await db.customerOverride.deleteMany({ where: { customerId: id, channelId } })
  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'CHANNEL_OVERRIDE_REMOVE',
    entityType: 'CUSTOMER',
    entityId: id,
    newValue: { channelId },
    request,
  })
  return Response.json({ ok: true })
})
