import { db } from '@/lib/db'
import { adminRoute, audit } from '@/lib/server/auth'
import { encryptSecret, maskSecret } from '@/lib/server/crypto'

export const dynamic = 'force-dynamic'

export const GET = adminRoute(async (_request, admin) => {
  const portals = await db.portal.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { channels: { where: { isActive: true } } } } },
  })
  return Response.json({
    items: portals.map(({ _count, password, fileData, ...portal }) => ({
      ...portal,
      // never ship the credential or the (potentially huge) raw playlist to the client
      password: maskSecret(password),
      hasFileData: !!fileData,
      channelCount: _count.channels,
    })),
  })
})

export const POST = adminRoute(async (request, admin) => {
  let body: {
    name?: string
    type?: string
    url?: string
    macAddress?: string
    username?: string
    password?: string
    epgUrl?: string
    notes?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = body.name?.trim()
  const type = body.type?.trim().toUpperCase()
  if (!name || !type) return Response.json({ error: 'Name aur type zaroori hain' }, { status: 400 })
  if (!['STALKER', 'XTREAM', 'M3U_URL', 'M3U_FILE'].includes(type)) {
    return Response.json({ error: 'Type STALKER, XTREAM, M3U_URL ya M3U_FILE hona chahiye' }, { status: 400 })
  }

  const url = body.url?.trim() || null
  if ((type === 'STALKER' || type === 'XTREAM' || type === 'M3U_URL') && !url) {
    return Response.json({ error: 'URL/link zaroori hai' }, { status: 400 })
  }
  if (type === 'STALKER' && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(body.macAddress?.trim() ?? '')) {
    return Response.json({ error: 'Valid MAC address daalo (jaise 00:1A:79:XX:XX:XX)' }, { status: 400 })
  }
  if (type === 'XTREAM' && (!body.username?.trim() || !body.password?.trim())) {
    return Response.json({ error: 'Xtream username aur password zaroori hain' }, { status: 400 })
  }

  const portal = await db.portal.create({
    data: {
      organizationId: admin.organizationId,
      name,
      type,
      url,
      macAddress: body.macAddress?.trim().toUpperCase() || null,
      username: body.username?.trim() || null,
      password: encryptSecret(body.password?.trim() || null),
      epgUrl: body.epgUrl?.trim() || null,
      notes: body.notes?.trim() || null,
      status: 'PENDING',
    },
  })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PORTAL_CREATE',
    entityType: 'PORTAL',
    entityId: portal.id,
    newValue: { name, type, url },
    request,
  })

  return Response.json(portal, { status: 201 })
})
