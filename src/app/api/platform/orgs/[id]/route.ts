import { db } from '@/lib/db'
import { audit, HttpError, platformRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

const STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED']
const PLATFORM_PLANS = ['TRIAL', 'STARTER', 'PRO', 'SCALE']

export const GET = platformRouteCtx(async (_request, { params }) => {
  const { id } = await params
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      _count: { select: { customers: true, channels: true, portals: true, plans: true, admins: true } },
      admins: { select: { id: true, username: true, email: true, role: true, isActive: true, createdAt: true } },
    },
  })
  if (!org) throw new HttpError(404, 'Organization nahi mila')

  const activeCustomers = await db.customer.count({ where: { organizationId: id, status: 'ACTIVE' } })

  return Response.json({
    ...org,
    activeCustomers,
  })
})

export const PATCH = platformRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  const org = await db.organization.findUnique({ where: { id } })
  if (!org) throw new HttpError(404, 'Organization nahi mila')

  let body: {
    name?: string
    status?: string
    platformPlan?: string
    platformValidUntil?: string | null
    customDomain?: string | null
    appName?: string | null
    logoUrl?: string | null
    primaryColor?: string | null
    supportEmail?: string | null
  }
  try {
    body = await request.json()
  } catch {
    throw new HttpError(400, 'Invalid request body')
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Invalid status')
    data.status = body.status
  }
  if (body.platformPlan !== undefined) {
    if (!PLATFORM_PLANS.includes(body.platformPlan)) throw new HttpError(400, 'Invalid platform plan')
    data.platformPlan = body.platformPlan
  }
  if (body.platformValidUntil !== undefined) {
    data.platformValidUntil = body.platformValidUntil ? new Date(body.platformValidUntil) : null
  }
  if (body.customDomain !== undefined) data.customDomain = body.customDomain?.trim().toLowerCase() || null
  if (body.appName !== undefined) data.appName = body.appName?.trim() || null
  if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl?.trim() || null
  if (body.primaryColor !== undefined) data.primaryColor = body.primaryColor?.trim() || null
  if (body.supportEmail !== undefined) data.supportEmail = body.supportEmail?.trim().toLowerCase() || null

  const updated = await db.organization.update({ where: { id }, data })

  await audit({
    organizationId: id,
    adminId: admin.id,
    adminName: admin.username,
    action: 'PLATFORM_ORG_UPDATE',
    entityType: 'ORGANIZATION',
    entityId: id,
    oldValue: { status: org.status, platformPlan: org.platformPlan, platformValidUntil: org.platformValidUntil },
    newValue: { status: updated.status, platformPlan: updated.platformPlan, platformValidUntil: updated.platformValidUntil },
    request,
  })

  return Response.json({ ok: true, organization: updated })
})

export const DELETE = platformRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  const org = await db.organization.findUnique({ where: { id }, select: { id: true, slug: true, name: true } })
  if (!org) throw new HttpError(404, 'Organization nahi mila')
  if (org.slug === (process.env.ROOT_ORG_SLUG ?? 'root')) {
    throw new HttpError(400, 'Root organization delete nahi kar sakte')
  }

  await db.organization.delete({ where: { id } }) // channels/portals/plans/customers/admins cascade

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PLATFORM_ORG_DELETE',
    entityType: 'ORGANIZATION',
    entityId: id,
    oldValue: { slug: org.slug, name: org.name },
    request,
  })

  return Response.json({ ok: true })
})
