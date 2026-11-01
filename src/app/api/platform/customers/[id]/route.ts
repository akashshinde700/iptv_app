import { db } from '@/lib/db'
import { HttpError, platformRouteCtx } from '@/lib/server/auth'
import {
  backfillSubscriptions,
  deleteCustomer,
  readJson,
  setAccountStatus,
  updateCustomer,
  type CustomerInput,
} from '@/lib/server/billing'
import { ACCOUNT_STATUSES, customerState, daysRemaining, subscriptionState, type AccountStatus } from '@/lib/server/billing-rules'

export const dynamic = 'force-dynamic'

type Ctx = { id: string }

/** Everything the customer page shows: profile, current + past subscriptions, payments, devices. */
export const GET = platformRouteCtx<Ctx>(async (_request, { params }) => {
  const { id } = await params
  const now = new Date()
  const owner = await db.customer.findUnique({ where: { id }, select: { organizationId: true } })
  if (!owner) throw new HttpError(404, 'Customer not found')
  await backfillSubscriptions({ organizationId: owner.organizationId })

  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      plan: { select: { id: true, name: true, price: true, durationDays: true, maxDevices: true, allowAdult: true } },
      subscriptions: {
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        include: { payments: { orderBy: { createdAt: 'desc' } } },
      },
      sessions: {
        where: { expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
      },
    },
  })
  if (!customer) throw new HttpError(404, 'Customer not found')

  const { passwordHash: _hash, subscriptions, sessions, ...profile } = customer
  void _hash
  const subs = subscriptions.map((s) => ({
    ...s,
    state: subscriptionState(s, now),
    daysLeft: daysRemaining(s.endsAt, now),
  }))
  const current =
    subs.find((s) => s.state === 'ACTIVE' && s.startsAt <= now) ??
    subs.find((s) => s.state === 'ACTIVE') ??
    subs.find((s) => s.state !== 'CANCELLED') ??
    null

  return Response.json({
    customer: {
      ...profile,
      state: customerState(profile, now),
      daysLeft: profile.planExpiresAt ? daysRemaining(profile.planExpiresAt, now) : null,
    },
    currentSubscriptionId: current?.id ?? null,
    subscriptions: subs,
    payments: subscriptions.flatMap((s) => s.payments.map((p) => ({ ...p, planName: s.planName }))),
    sessions,
  })
})

/** Edit profile / reset password, or change the account status (suspend, activate, archive). */
export const PATCH = platformRouteCtx<Ctx>(async (request, { params }, admin) => {
  const { id } = await params
  const body = await readJson<CustomerInput & { accountStatus?: string }>(request)

  if (body.accountStatus !== undefined) {
    if (!(ACCOUNT_STATUSES as readonly string[]).includes(body.accountStatus)) throw new HttpError(400, 'Invalid account status')
    await setAccountStatus(id, {}, body.accountStatus as AccountStatus, admin, request)
  }
  const { accountStatus: _status, ...fields } = body
  void _status
  if (Object.values(fields).some((v) => v !== undefined)) {
    await updateCustomer(id, {}, fields, admin, request)
  }
  return Response.json({ ok: true })
})

/** Permanent delete — the client must echo the username back (?confirm=<username>). */
export const DELETE = platformRouteCtx<Ctx>(async (request, { params }, admin) => {
  const { id } = await params
  const confirm = new URL(request.url).searchParams.get('confirm')
  const customer = await db.customer.findUnique({ where: { id }, select: { username: true } })
  if (!customer) throw new HttpError(404, 'Customer not found')
  if (confirm !== customer.username) throw new HttpError(400, 'Type the username to confirm deletion')
  await deleteCustomer(id, {}, admin, request)
  return Response.json({ ok: true })
})
