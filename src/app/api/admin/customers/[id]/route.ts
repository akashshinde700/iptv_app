import { db } from '@/lib/db'
import { adminRouteCtx, HttpError } from '@/lib/server/auth'
import {
  backfillSubscriptions,
  changeSubscription,
  createSubscription,
  currentSubscriptionFor,
  deleteCustomer,
  findCustomer,
  readJson,
  setAccountStatus,
  updateCustomer,
} from '@/lib/server/billing'
import { subscriptionState } from '@/lib/server/billing-rules'

export const dynamic = 'force-dynamic'

export const GET = adminRouteCtx(async (_request, { params }, admin) => {
  const { id } = await params

  const customer = await db.customer.findFirst({
    where: { id, organizationId: admin.organizationId },
    include: {
      plan: true,
      overrides: { include: { channel: { select: { id: true, name: true, logo: true } } } },
    },
  })
  if (!customer) return Response.json({ error: 'Customer nahi mila' }, { status: 404 })

  const { passwordHash: _hash, ...safe } = customer
  void _hash
  return Response.json(safe)
})

/**
 * Operator admin panel edits. Plan actions go through the billing service so every change
 * is kept as subscription history and access is recomputed server-side.
 */
export const PATCH = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  const scope = { organizationId: admin.organizationId }
  const customer = await findCustomer(id, scope)
  await backfillSubscriptions(scope)

  const body = await readJson<{
    name?: string
    email?: string
    mobile?: string | null
    status?: string
    password?: string
    notes?: string | null
    planId?: string | null
    action?: 'assign_plan' | 'renew' | 'extend' | 'deactivate_plan' | 'activate_plan'
    extendDays?: number
  }>(request)

  const profileChanged =
    body.name !== undefined || body.email !== undefined || body.mobile !== undefined || body.notes !== undefined || !!body.password
  if (profileChanged) {
    await updateCustomer(
      id,
      scope,
      { name: body.name, email: body.email, mobile: body.mobile, notes: body.notes, password: body.password || undefined },
      admin,
      request,
    )
  }

  const requireCurrent = async () => {
    const sub = await currentSubscriptionFor(id)
    if (!sub) throw new HttpError(400, 'This customer has no subscription yet — assign a plan first')
    return sub
  }

  switch (body.action) {
    case 'assign_plan':
      if (!body.planId) throw new HttpError(400, 'planId zaroori hai')
      await createSubscription(id, scope, { planId: body.planId, replaceCurrent: true }, admin, request)
      break
    case 'renew':
      await changeSubscription((await requireCurrent()).id, scope, 'renew', {}, admin, request)
      break
    case 'extend':
      await changeSubscription((await requireCurrent()).id, scope, 'extend', { days: body.extendDays ?? 30 }, admin, request)
      break
    case 'deactivate_plan':
      await changeSubscription((await requireCurrent()).id, scope, 'suspend', {}, admin, request)
      break
    case 'activate_plan':
      await changeSubscription((await requireCurrent()).id, scope, 'resume', {}, admin, request)
      break
  }

  // The edit form always sends the status it showed — only act when it was changed.
  if (body.status && !body.action && body.status !== customer.status) {
    switch (body.status) {
      case 'ACTIVE': {
        await setAccountStatus(id, scope, 'ACTIVE', admin, request)
        const sub = await currentSubscriptionFor(id)
        if (sub && (sub.status === 'SUSPENDED' || sub.status === 'PENDING') && sub.endsAt > new Date()) {
          await changeSubscription(sub.id, scope, 'resume', {}, admin, request)
        }
        break
      }
      case 'SUSPENDED':
        await setAccountStatus(id, scope, 'SUSPENDED', admin, request)
        break
      case 'INACTIVE': {
        const sub = await currentSubscriptionFor(id)
        if (sub && subscriptionState(sub) === 'ACTIVE') await changeSubscription(sub.id, scope, 'suspend', {}, admin, request)
        break
      }
      case 'EXPIRED':
        throw new HttpError(400, 'Expiry is decided by the subscription end date')
      default:
        throw new HttpError(400, 'Invalid status')
    }
  }

  const updated = await db.customer.findUniqueOrThrow({
    where: { id },
    include: { plan: { select: { id: true, name: true, isActive: true } } },
  })
  const { passwordHash: _hash, ...safe } = updated
  void _hash
  return Response.json(safe)
})

export const DELETE = adminRouteCtx(async (request, { params }, admin) => {
  const { id } = await params
  await deleteCustomer(id, { organizationId: admin.organizationId }, admin, request)
  return Response.json({ ok: true })
})
