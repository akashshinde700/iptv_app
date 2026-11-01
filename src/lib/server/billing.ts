/**
 * Customers, subscriptions & payments — the one place that changes who can watch.
 *
 * Customer ─< Subscription ─< Payment. After every change the customer's current access
 * is recomputed (accessMirror) and written onto Customer.status / planId /
 * planStartedAt / planExpiresAt, which the customer login route and the access engine
 * (access.ts) read. Nothing the browser sends about status, dates or plans is trusted:
 * every value is re-derived here from the database.
 *
 * Used by both the operator admin panel (scope = the admin's organization) and the
 * platform console (scope = any organization).
 */
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { audit, destroyAllCustomerSessions, hashPassword, HttpError, type AdminIdentity } from '@/lib/server/auth'
import {
  PAYMENT_METHODS,
  accessMirror,
  addDays,
  canChangePaymentStatus,
  finalAmount,
  paymentStatusFor,
  subscriptionState,
  type AccountStatus,
} from '@/lib/server/billing-rules'

type Client = Prisma.TransactionClient

/** `{}` = every organization (platform staff), `{ organizationId }` = one tenant. */
export type Scope = { organizationId?: string }

export function scopeFor(admin: AdminIdentity, requestedOrgId?: string | null): Scope {
  if (!admin.isPlatformStaff) return { organizationId: admin.organizationId }
  return requestedOrgId ? { organizationId: requestedOrgId } : {}
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Invalid request body')
  }
}

const MAX_DAYS = 3650

function intInRange(value: unknown, min: number, max: number, label: string): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`)
  const i = Math.floor(n)
  if (i < min || i > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`)
  return i
}

/* ------------------------------ access sync ------------------------------ */

export async function syncCustomerAccess(customerId: string, client: Client = db) {
  const customer = await client.customer.findUnique({
    where: { id: customerId },
    select: {
      accountStatus: true,
      subscriptions: { select: { planId: true, status: true, startsAt: true, endsAt: true, createdAt: true } },
    },
  })
  if (!customer) return null
  const mirror = accessMirror(customer.subscriptions, customer.accountStatus)
  await client.customer.update({ where: { id: customerId }, data: mirror })
  return mirror
}

/**
 * One-time import for customers created before subscription history existed: their
 * plan fields become a subscription row (payment "not recorded"), and a suspended
 * customer becomes an admin-suspended account. Idempotent and cheap to call.
 */
export async function backfillSubscriptions(scope: Scope = {}) {
  await db.customer.updateMany({
    where: { ...scope, status: 'SUSPENDED', accountStatus: 'ACTIVE', subscriptions: { none: {} } },
    data: { accountStatus: 'SUSPENDED' },
  })
  const legacy = await db.customer.findMany({
    where: { ...scope, planId: { not: null }, subscriptions: { none: {} } },
    include: { plan: true },
    take: 500,
  })
  for (const c of legacy) {
    const startsAt = c.planStartedAt ?? c.createdAt
    const endsAt = c.planExpiresAt ?? addDays(startsAt, c.plan?.durationDays ?? 30)
    const price = c.plan?.price ?? 0
    await db.subscription.create({
      data: {
        organizationId: c.organizationId,
        customerId: c.id,
        planId: c.planId,
        planName: c.plan?.name ?? 'Plan',
        status: c.status === 'INACTIVE' ? 'SUSPENDED' : 'ACTIVE',
        startsAt,
        endsAt,
        price,
        amount: price,
        paymentStatus: price === 0 ? 'PAID' : 'NOT_RECORDED',
        notes: 'Imported from the customer record',
        createdBy: 'system',
      },
    })
  }
  return legacy.length
}

/* -------------------------------- lookups -------------------------------- */

export async function findCustomer(id: string, scope: Scope) {
  const customer = await db.customer.findFirst({ where: { id, ...scope } })
  if (!customer) throw new HttpError(404, 'Customer not found')
  return customer
}

export async function findSubscription(id: string, scope: Scope) {
  const sub = await db.subscription.findFirst({ where: { id, ...scope }, include: { payments: true } })
  if (!sub) throw new HttpError(404, 'Subscription not found')
  return sub
}

/** The subscription an admin acts on by default (same rule as the customer page). */
export async function currentSubscriptionFor(customerId: string) {
  const now = new Date()
  const subs = await db.subscription.findMany({
    where: { customerId },
    orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
  })
  const withState = subs.map((s) => ({ s, state: subscriptionState(s, now) }))
  const pick =
    withState.find((x) => x.state === 'ACTIVE' && x.s.startsAt.getTime() <= now.getTime()) ??
    withState.find((x) => x.state === 'ACTIVE') ??
    withState.find((x) => x.state !== 'CANCELLED')
  return pick?.s ?? null
}

/* ------------------------------- customers ------------------------------- */

export interface CustomerInput {
  name?: string
  username?: string
  email?: string
  password?: string
  mobile?: string | null
  notes?: string | null
}

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createCustomer(
  organizationId: string,
  input: CustomerInput,
  actor: AdminIdentity,
  subscription: SubscriptionInput | null,
  request?: Request,
) {
  const name = input.name?.trim()
  const username = input.username?.trim().toLowerCase() ?? ''
  const email = input.email?.trim().toLowerCase() ?? ''
  const password = input.password ?? ''
  if (!name) throw new HttpError(400, 'Full name is required')
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username: 3–40 letters, numbers, dot, dash or underscore')
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters')

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
  if (!org) throw new HttpError(400, 'Organization not found')

  const clash = await db.customer.findFirst({
    where: { organizationId, OR: [{ username }, { email }] },
    select: { username: true },
  })
  if (clash) {
    throw new HttpError(409, clash.username === username ? 'This username is already taken' : 'This email is already used')
  }

  const customer = await db.customer.create({
    data: {
      organizationId,
      name,
      username,
      email,
      passwordHash: hashPassword(password),
      mobile: input.mobile?.trim() || null,
      notes: input.notes?.trim() || null,
      status: 'ACTIVE',
      accountStatus: 'ACTIVE',
    },
  })

  await audit({
    organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: 'CUSTOMER_CREATE',
    entityType: 'CUSTOMER',
    entityId: customer.id,
    newValue: { username, email, withSubscription: !!subscription },
    request,
  })

  if (subscription) await createSubscription(customer.id, { organizationId }, subscription, actor, request)
  return customer
}

export async function updateCustomer(id: string, scope: Scope, input: CustomerInput, actor: AdminIdentity, request?: Request) {
  const customer = await findCustomer(id, scope)
  const data: Prisma.CustomerUpdateInput = {}
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new HttpError(400, 'Full name is required')
    data.name = input.name.trim()
  }
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
    if (email !== customer.email) {
      const clash = await db.customer.findFirst({ where: { organizationId: customer.organizationId, email, id: { not: id } } })
      if (clash) throw new HttpError(409, 'This email is already used')
    }
    data.email = email
  }
  if (input.mobile !== undefined) data.mobile = input.mobile?.trim() || null
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null
  let passwordReset = false
  if (input.password) {
    if (input.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters')
    data.passwordHash = hashPassword(input.password)
    passwordReset = true
  }

  const updated = await db.customer.update({ where: { id }, data })
  if (passwordReset) await destroyAllCustomerSessions(id)

  await audit({
    organizationId: customer.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: passwordReset ? 'CUSTOMER_PASSWORD_RESET' : 'CUSTOMER_UPDATE',
    entityType: 'CUSTOMER',
    entityId: id,
    oldValue: { name: customer.name, email: customer.email, mobile: customer.mobile },
    newValue: { name: updated.name, email: updated.email, mobile: updated.mobile },
    request,
  })
  return updated
}

/** Suspend / reactivate / archive the account itself (independent of the subscription). */
export async function setAccountStatus(
  id: string,
  scope: Scope,
  next: AccountStatus,
  actor: AdminIdentity,
  request?: Request,
) {
  const customer = await findCustomer(id, scope)
  if (customer.accountStatus === next) return customer

  const updated = await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id }, data: { accountStatus: next } })
    await syncCustomerAccess(id, tx)
    return tx.customer.findUniqueOrThrow({ where: { id } })
  })
  if (next !== 'ACTIVE') await destroyAllCustomerSessions(id)

  await audit({
    organizationId: customer.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: next === 'ACTIVE' ? 'CUSTOMER_ACTIVATE' : next === 'SUSPENDED' ? 'CUSTOMER_SUSPEND' : 'CUSTOMER_ARCHIVE',
    entityType: 'CUSTOMER',
    entityId: id,
    oldValue: { accountStatus: customer.accountStatus, status: customer.status },
    newValue: { accountStatus: updated.accountStatus, status: updated.status },
    request,
  })
  return updated
}

export async function deleteCustomer(id: string, scope: Scope, actor: AdminIdentity, request?: Request) {
  const customer = await findCustomer(id, scope)
  await db.customer.delete({ where: { id } })
  await audit({
    organizationId: customer.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: 'CUSTOMER_DELETE',
    entityType: 'CUSTOMER',
    entityId: id,
    oldValue: { username: customer.username, email: customer.email },
    request,
  })
}

/* ----------------------------- subscriptions ----------------------------- */

export interface PaymentInput {
  amount?: number
  method?: string
  reference?: string | null
  status?: string
  notes?: string | null
}

export interface SubscriptionInput {
  planId?: string
  startsAt?: string | null
  durationDays?: number
  price?: number
  discount?: number
  /** PENDING = created but no access until it is paid / activated */
  status?: string
  notes?: string | null
  autoRenew?: boolean
  payment?: PaymentInput | null
  /** upgrade / downgrade: cancel whatever is running now */
  replaceCurrent?: boolean
}

function parseStart(value: string | null | undefined, now: Date): Date {
  if (!value) return now
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid start date')
  // today is fine (date-only input = midnight); future starts would need a scheduler
  if (date.getTime() > now.getTime() + 86_400_000) throw new HttpError(400, 'Start date cannot be in the future')
  return date.getTime() > now.getTime() ? now : date
}

async function writePayment(
  tx: Client,
  sub: { id: string; organizationId: string; customerId: string; amount: number },
  input: PaymentInput,
  actor: AdminIdentity,
) {
  const status = input.status ?? 'PAID'
  if (!['PAID', 'PENDING', 'FAILED'].includes(status)) throw new HttpError(400, 'Payment status must be PAID, PENDING or FAILED')
  const method = input.method ?? 'CASH'
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) throw new HttpError(400, 'Invalid payment method')
  const amount = intInRange(input.amount ?? sub.amount, 0, 10_000_000, 'Amount')
  return tx.payment.create({
    data: {
      organizationId: sub.organizationId,
      customerId: sub.customerId,
      subscriptionId: sub.id,
      amount,
      method,
      reference: input.reference?.trim() || null,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
      notes: input.notes?.trim() || null,
      recordedBy: actor.username,
    },
  })
}

/** Recompute a subscription's payment status; a fully paid PENDING subscription activates. */
async function refreshPaymentStatus(tx: Client, subscriptionId: string) {
  const sub = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, include: { payments: true } })
  const paymentStatus = paymentStatusFor(sub.amount, sub.payments)
  const activate = sub.status === 'PENDING' && paymentStatus === 'PAID' && sub.endsAt.getTime() > Date.now()
  return tx.subscription.update({
    where: { id: subscriptionId },
    data: { paymentStatus, ...(activate ? { status: 'ACTIVE' } : {}) },
  })
}

export async function createSubscription(
  customerId: string,
  scope: Scope,
  input: SubscriptionInput,
  actor: AdminIdentity,
  request?: Request,
) {
  const customer = await findCustomer(customerId, scope)
  if (customer.accountStatus === 'ARCHIVED') throw new HttpError(400, 'Restore the archived customer first')
  if (!input.planId) throw new HttpError(400, 'Choose a plan')
  const plan = await db.plan.findFirst({ where: { id: input.planId, organizationId: customer.organizationId } })
  if (!plan) throw new HttpError(400, "This plan doesn't belong to the customer's organization")
  if (!plan.isActive) throw new HttpError(400, 'This plan is inactive')

  const now = new Date()
  const startsAt = parseStart(input.startsAt, now)
  const durationDays = intInRange(input.durationDays ?? plan.durationDays, 1, MAX_DAYS, 'Duration (days)')
  const price = intInRange(input.price ?? plan.price, 0, 10_000_000, 'Price')
  const discount = intInRange(input.discount ?? 0, 0, price, 'Discount')
  const amount = finalAmount(price, discount)
  const status = input.status ?? 'ACTIVE'
  if (status !== 'ACTIVE' && status !== 'PENDING') throw new HttpError(400, 'New subscriptions are ACTIVE or PENDING')

  const sub = await db.$transaction(async (tx) => {
    let replaced = 0
    if (input.replaceCurrent) {
      const { count } = await tx.subscription.updateMany({
        where: { customerId, status: { in: ['ACTIVE', 'PENDING', 'SUSPENDED'] }, endsAt: { gt: now } },
        data: { status: 'CANCELLED', cancelledAt: now },
      })
      replaced = count
    }
    const created = await tx.subscription.create({
      data: {
        organizationId: customer.organizationId,
        customerId,
        planId: plan.id,
        planName: plan.name,
        status,
        startsAt,
        endsAt: addDays(startsAt, durationDays),
        price,
        discount,
        amount,
        paymentStatus: amount === 0 ? 'PAID' : 'NOT_RECORDED',
        autoRenew: !!input.autoRenew,
        notes: input.notes?.trim() || (replaced > 0 ? 'Plan change' : null),
        createdBy: actor.username,
      },
    })
    if (input.payment) {
      await writePayment(tx, created, input.payment, actor)
      await refreshPaymentStatus(tx, created.id)
    }
    await syncCustomerAccess(customerId, tx)
    return tx.subscription.findUniqueOrThrow({ where: { id: created.id } })
  })

  await audit({
    organizationId: customer.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: input.replaceCurrent ? 'SUBSCRIPTION_CHANGE_PLAN' : 'SUBSCRIPTION_CREATE',
    entityType: 'SUBSCRIPTION',
    entityId: sub.id,
    newValue: { customerId, plan: plan.name, status: sub.status, endsAt: sub.endsAt, amount, paymentStatus: sub.paymentStatus },
    request,
  })
  return sub
}

export type SubscriptionAction = 'renew' | 'extend' | 'suspend' | 'resume' | 'cancel'

export async function changeSubscription(
  id: string,
  scope: Scope,
  action: SubscriptionAction,
  input: { days?: number; price?: number; discount?: number; payment?: PaymentInput | null },
  actor: AdminIdentity,
  request?: Request,
) {
  const sub = await findSubscription(id, scope)
  const now = new Date()
  const state = subscriptionState(sub, now)
  let result = sub as { id: string; status: string; endsAt: Date }
  let auditAction: string

  switch (action) {
    case 'renew': {
      if (state === 'CANCELLED') throw new HttpError(400, 'A cancelled subscription cannot be renewed — create a new one')
      if (!sub.planId) throw new HttpError(400, 'The plan no longer exists — create a new subscription')
      const plan = await db.plan.findFirst({ where: { id: sub.planId } })
      if (!plan) throw new HttpError(400, 'The plan no longer exists — create a new subscription')
      const days = intInRange(input.days ?? plan.durationDays, 1, MAX_DAYS, 'Duration (days)')
      const price = intInRange(input.price ?? plan.price, 0, 10_000_000, 'Price')
      const discount = intInRange(input.discount ?? 0, 0, price, 'Discount')
      const amount = finalAmount(price, discount)
      // the new period starts when the current one ends (or now, if it already ended)
      const startsAt = state === 'ACTIVE' || state === 'SUSPENDED' ? sub.endsAt : now
      result = await db.$transaction(async (tx) => {
        const created = await tx.subscription.create({
          data: {
            organizationId: sub.organizationId,
            customerId: sub.customerId,
            planId: plan.id,
            planName: plan.name,
            status: 'ACTIVE',
            startsAt,
            endsAt: addDays(startsAt, days),
            price,
            discount,
            amount,
            paymentStatus: amount === 0 ? 'PAID' : 'NOT_RECORDED',
            notes: 'Renewal',
            createdBy: actor.username,
          },
        })
        if (input.payment) {
          await writePayment(tx, created, input.payment, actor)
          await refreshPaymentStatus(tx, created.id)
        }
        await syncCustomerAccess(sub.customerId, tx)
        return tx.subscription.findUniqueOrThrow({ where: { id: created.id } })
      })
      auditAction = 'SUBSCRIPTION_RENEW'
      break
    }
    case 'extend': {
      if (state === 'CANCELLED') throw new HttpError(400, 'A cancelled subscription cannot be extended')
      const days = intInRange(input.days, 1, MAX_DAYS, 'Days')
      const base = state === 'EXPIRED' ? now : sub.endsAt
      result = await db.$transaction(async (tx) => {
        const updated = await tx.subscription.update({ where: { id }, data: { endsAt: addDays(base, days) } })
        await syncCustomerAccess(sub.customerId, tx)
        return updated
      })
      auditAction = 'SUBSCRIPTION_EXTEND'
      break
    }
    case 'suspend': {
      if (state !== 'ACTIVE' && state !== 'PENDING') throw new HttpError(400, `Only active or pending subscriptions can be suspended (this one is ${state.toLowerCase()})`)
      result = await db.$transaction(async (tx) => {
        const updated = await tx.subscription.update({ where: { id }, data: { status: 'SUSPENDED', suspendedAt: now } })
        await syncCustomerAccess(sub.customerId, tx)
        return updated
      })
      auditAction = 'SUBSCRIPTION_SUSPEND'
      break
    }
    case 'resume': {
      if (state !== 'SUSPENDED' && state !== 'PENDING') throw new HttpError(400, 'Only suspended or pending subscriptions can be resumed')
      if (sub.endsAt.getTime() <= now.getTime()) throw new HttpError(400, 'This subscription has already ended — renew or extend it instead')
      result = await db.$transaction(async (tx) => {
        const updated = await tx.subscription.update({ where: { id }, data: { status: 'ACTIVE', suspendedAt: null } })
        await syncCustomerAccess(sub.customerId, tx)
        return updated
      })
      auditAction = 'SUBSCRIPTION_RESUME'
      break
    }
    case 'cancel': {
      if (state === 'CANCELLED') throw new HttpError(400, 'Already cancelled')
      result = await db.$transaction(async (tx) => {
        const updated = await tx.subscription.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now } })
        await syncCustomerAccess(sub.customerId, tx)
        return updated
      })
      auditAction = 'SUBSCRIPTION_CANCEL'
      break
    }
    default:
      throw new HttpError(400, 'Unknown action')
  }

  await audit({
    organizationId: sub.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: auditAction,
    entityType: 'SUBSCRIPTION',
    entityId: result.id,
    oldValue: { status: sub.status, endsAt: sub.endsAt },
    newValue: { status: result.status, endsAt: result.endsAt, days: input.days },
    request,
  })
  return result
}

/* -------------------------------- payments -------------------------------- */

export async function recordPayment(subscriptionId: string, scope: Scope, input: PaymentInput, actor: AdminIdentity, request?: Request) {
  const sub = await findSubscription(subscriptionId, scope)
  if (sub.status === 'CANCELLED') throw new HttpError(400, 'Cannot record a payment on a cancelled subscription')
  const payment = await db.$transaction(async (tx) => {
    const created = await writePayment(tx, sub, input, actor)
    await refreshPaymentStatus(tx, sub.id)
    await syncCustomerAccess(sub.customerId, tx)
    return created
  })
  await audit({
    organizationId: sub.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: 'PAYMENT_RECORD',
    entityType: 'PAYMENT',
    entityId: payment.id,
    newValue: { subscriptionId, amount: payment.amount, method: payment.method, status: payment.status, reference: payment.reference },
    request,
  })
  return payment
}

export async function updatePayment(
  id: string,
  scope: Scope,
  input: { status?: string; notes?: string | null; reference?: string | null },
  actor: AdminIdentity,
  request?: Request,
) {
  const payment = await db.payment.findFirst({ where: { id, ...scope } })
  if (!payment) throw new HttpError(404, 'Payment not found')
  const data: Prisma.PaymentUpdateInput = {}
  if (input.status !== undefined && input.status !== payment.status) {
    if (!canChangePaymentStatus(payment.status, input.status)) {
      throw new HttpError(400, `A ${payment.status.toLowerCase()} payment cannot become ${input.status.toLowerCase()}`)
    }
    data.status = input.status
    if (input.status === 'PAID') data.paidAt = new Date()
  }
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null
  if (input.reference !== undefined) data.reference = input.reference?.trim() || null

  const updated = await db.$transaction(async (tx) => {
    const saved = await tx.payment.update({ where: { id }, data })
    if (payment.subscriptionId) {
      await refreshPaymentStatus(tx, payment.subscriptionId)
      await syncCustomerAccess(payment.customerId, tx)
    }
    return saved
  })

  await audit({
    organizationId: payment.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: 'PAYMENT_UPDATE',
    entityType: 'PAYMENT',
    entityId: id,
    oldValue: { status: payment.status, reference: payment.reference },
    newValue: { status: updated.status, reference: updated.reference },
    request,
  })
  return updated
}
