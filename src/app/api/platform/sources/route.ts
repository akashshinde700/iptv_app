import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError, platformRoute } from '@/lib/server/auth'
import { readJson } from '@/lib/server/billing'
import { createSource, toSourceDto, type SourceInput } from '@/lib/server/sources'

export const dynamic = 'force-dynamic'

/** Content sources across organizations, with summary counts and health. */
export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId') || undefined
  const type = sp.get('type') || undefined
  const status = sp.get('status') || undefined // ACTIVE | ERROR | PENDING | SYNCING | INACTIVE(disabled)
  const search = sp.get('search')?.trim()

  const where: Prisma.PortalWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(type && type !== 'ALL' ? { type } : {}),
    ...(status === 'DISABLED' ? { isActive: false } : status && status !== 'ALL' ? { status, isActive: true } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { url: { contains: search } }] } : {}),
  }

  const [rows, summary] = await Promise.all([
    db.portal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { id: true, name: true } }, _count: { select: { channels: { where: { isActive: true } } } } },
    }),
    db.portal.findMany({ where: organizationId ? { organizationId } : {}, select: { status: true, isActive: true } }),
  ])

  const totalChannels = await db.channel.count({
    where: { portalId: { not: null }, isActive: true, ...(organizationId ? { organizationId } : {}) },
  })
  const lastSync = await db.portal.findFirst({
    where: { ...(organizationId ? { organizationId } : {}), lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: 'desc' },
    select: { lastSyncedAt: true },
  })

  return Response.json({
    items: rows.map(toSourceDto),
    summary: {
      total: summary.length,
      active: summary.filter((p) => p.isActive && p.status === 'ACTIVE').length,
      failed: summary.filter((p) => p.isActive && p.status === 'ERROR').length,
      disabled: summary.filter((p) => !p.isActive).length,
      totalChannels,
      lastSyncedAt: lastSync?.lastSyncedAt ?? null,
    },
  })
})

/** Add a source (does NOT import — the client tests then syncs separately). */
export const POST = platformRoute(async (request, admin) => {
  const body = await readJson<SourceInput & { organizationId?: string }>(request)
  if (!body.organizationId) throw new HttpError(400, 'Choose an organization')
  const portal = await createSource(body.organizationId, body, admin, request)
  return Response.json({ id: portal.id }, { status: 201 })
})
