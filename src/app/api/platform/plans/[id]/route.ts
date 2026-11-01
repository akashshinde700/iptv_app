import { db } from '@/lib/db'
import { audit, HttpError, platformRouteCtx } from '@/lib/server/auth'
import { readJson } from '@/lib/server/billing'
import { planData, setPlanChannels, splitRules, type PlanInput } from '@/lib/server/plans'

export const dynamic = 'force-dynamic'

type Ctx = { id: string }

/** Plan detail incl. its explicit channels (names) — used to preload the edit form. */
export const GET = platformRouteCtx<Ctx>(async (_request, { params }) => {
  const { id } = await params
  const plan = await db.plan.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      planChannels: { include: { channel: { select: { id: true, name: true, logo: true } } } },
      _count: { select: { customers: true, subscriptions: { where: { status: 'ACTIVE', endsAt: { gt: new Date() } } } } },
    },
  })
  if (!plan) throw new HttpError(404, 'Plan not found')
  const { planChannels, _count, ...rest } = plan
  return Response.json({
    ...rest,
    ...splitRules(plan),
    activeSubscriptions: _count.subscriptions,
    customerCount: _count.customers,
    channels: planChannels.map((pc) => pc.channel),
  })
})

export const PATCH = platformRouteCtx<Ctx>(async (request, { params }, admin) => {
  const { id } = await params
  const plan = await db.plan.findUnique({ where: { id } })
  if (!plan) throw new HttpError(404, 'Plan not found')
  const body = await readJson<PlanInput & { channelIds?: string[] }>(request)
  const updated = await db.plan.update({ where: { id }, data: planData(body, true) })
  await setPlanChannels(id, plan.organizationId, body.channelIds)
  await audit({
    organizationId: plan.organizationId,
    adminId: admin.id,
    adminName: admin.username,
    action:
      body.isActive !== undefined && body.isActive !== plan.isActive
        ? body.isActive
          ? 'PLAN_ACTIVATE'
          : 'PLAN_DEACTIVATE'
        : 'PLAN_UPDATE',
    entityType: 'PLAN',
    entityId: id,
    oldValue: { name: plan.name, price: plan.price, durationDays: plan.durationDays, isActive: plan.isActive },
    newValue: { name: updated.name, price: updated.price, durationDays: updated.durationDays, isActive: updated.isActive },
    request,
  })
  return Response.json(updated)
})

/** Only unused plans can be deleted — deactivate (archive) plans that have subscribers. */
export const DELETE = platformRouteCtx<Ctx>(async (request, { params }, admin) => {
  const { id } = await params
  const plan = await db.plan.findUnique({
    where: { id },
    include: { _count: { select: { customers: true, subscriptions: true } } },
  })
  if (!plan) throw new HttpError(404, 'Plan not found')
  if (plan._count.customers > 0 || plan._count.subscriptions > 0) {
    throw new HttpError(409, 'This plan has subscribers — deactivate it instead of deleting')
  }
  await db.plan.delete({ where: { id } })
  await audit({
    organizationId: plan.organizationId,
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
