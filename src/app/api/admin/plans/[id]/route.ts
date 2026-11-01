import { db } from '@/lib/db'
import { adminRouteCtx, audit } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

function toPipe(values: string[] | undefined): string | undefined {
  if (values === undefined) return undefined
  const clean = values.map((v) => v.trim()).filter(Boolean)
  return clean.length > 0 ? `|${clean.join('|')}|` : '|'
}

export const PATCH = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params

  const plan = await db.plan.findFirst({ where: { id, organizationId: admin.organizationId } })
  if (!plan) return Response.json({ error: 'Plan nahi mila' }, { status: 404 })

  let body: {
    name?: string
    description?: string
    price?: number
    durationDays?: number
    allowAdult?: boolean
    maxDevices?: number
    regions?: string[]
    countries?: string[]
    languages?: string[]
    categories?: string[]
    isActive?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.description !== undefined) data.description = body.description?.trim() || null
  if (body.price !== undefined) data.price = Math.max(0, Math.floor(body.price))
  if (body.durationDays !== undefined) data.durationDays = Math.max(1, Math.floor(body.durationDays))
  if (body.allowAdult !== undefined) data.allowAdult = body.allowAdult
  if (body.maxDevices !== undefined) data.maxDevices = Math.max(1, Math.floor(body.maxDevices))
  if (body.regions !== undefined) data.regions = toPipe(body.regions)
  if (body.countries !== undefined) data.countries = toPipe(body.countries)
  if (body.languages !== undefined) data.languages = toPipe(body.languages)
  if (body.categories !== undefined) data.categories = toPipe(body.categories)

  let auditAction = 'PLAN_UPDATE'
  if (body.isActive !== undefined && body.isActive !== plan.isActive) {
    auditAction = body.isActive ? 'PLAN_ACTIVATE' : 'PLAN_DEACTIVATE'
    data.isActive = body.isActive
  }

  const updated = await db.plan.update({ where: { id }, data })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: auditAction,
    entityType: 'PLAN',
    entityId: id,
    oldValue: { name: plan.name, isActive: plan.isActive, allowAdult: plan.allowAdult, price: plan.price },
    newValue: { name: updated.name, isActive: updated.isActive, allowAdult: updated.allowAdult, price: updated.price },
    request,
  })

  return Response.json(updated)
})

export const DELETE = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params

  const plan = await db.plan.findFirst({
    where: { id, organizationId: admin.organizationId },
    include: { _count: { select: { customers: true } } },
  })
  if (!plan) return Response.json({ error: 'Plan nahi mila' }, { status: 404 })
  if (plan._count.customers > 0) {
    return Response.json(
      { error: `Is plan pe ${plan._count.customers} customers assigned hain — pehle unka plan change karo` },
      { status: 409 },
    )
  }

  await db.plan.delete({ where: { id } })
  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PLAN_DELETE',
    entityType: 'PLAN',
    entityId: id,
    oldValue: { name: plan.name },
    request,
  })
  return Response.json({ ok: true })
})
