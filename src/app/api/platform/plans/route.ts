import { db } from '@/lib/db'
import { audit, HttpError, platformRoute } from '@/lib/server/auth'
import { readJson } from '@/lib/server/billing'
import { planData, setPlanChannels, splitRules, type PlanInput } from '@/lib/server/plans'

export const dynamic = 'force-dynamic'

/** Plans of every organization (or one) with subscriber counts. */
export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId') || undefined
  const now = new Date()
  const plans = await db.plan.findMany({
    where: organizationId ? { organizationId } : {},
    orderBy: [{ organizationId: 'asc' }, { price: 'asc' }],
    include: {
      organization: { select: { id: true, name: true } },
      _count: {
        select: {
          customers: true,
          subscriptions: { where: { status: 'ACTIVE', endsAt: { gt: now } } },
          planChannels: true,
        },
      },
    },
  })
  return Response.json({
    items: plans.map(({ _count, ...plan }) => ({
      ...plan,
      ...splitRules(plan),
      customerCount: _count.customers,
      activeSubscriptions: _count.subscriptions,
      channelCount: _count.planChannels,
    })),
  })
})

export const POST = platformRoute(async (request, admin) => {
  const body = await readJson<PlanInput & { organizationId?: string; channelIds?: string[] }>(request)
  if (!body.organizationId) throw new HttpError(400, 'Choose an organization')
  const org = await db.organization.findUnique({ where: { id: body.organizationId }, select: { id: true } })
  if (!org) throw new HttpError(400, 'Organization not found')
  const data = planData(body, false)
  const plan = await db.plan.create({
    data: {
      ...(data as Record<string, unknown>),
      name: data.name as string,
      organizationId: org.id,
    },
  })
  await setPlanChannels(plan.id, org.id, body.channelIds)
  await audit({
    organizationId: org.id,
    adminId: admin.id,
    adminName: admin.username,
    action: 'PLAN_CREATE',
    entityType: 'PLAN',
    entityId: plan.id,
    newValue: { name: plan.name, price: plan.price, durationDays: plan.durationDays },
    request,
  })
  return Response.json(plan, { status: 201 })
})
