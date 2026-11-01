/**
 * Pure subscription / customer status rules (no database) — shared by the billing
 * service, the list filters and unit tests.
 */
import type { Prisma } from '@prisma/client'

const DAY = 86_400_000

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'CANCELLED'] as const
export const PAYMENT_STATUSES = ['PAID', 'PENDING', 'FAILED', 'REFUNDED', 'CANCELLED'] as const
export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const
export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const

export type SubscriptionState = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED'
export type CustomerState = 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'SUSPENDED' | 'NO_SUBSCRIPTION' | 'ARCHIVED'
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY)
}

export function daysRemaining(endsAt: Date, now = new Date()): number {
  return Math.ceil((endsAt.getTime() - now.getTime()) / DAY)
}

export function finalAmount(price: number, discount: number): number {
  return Math.max(0, Math.floor(price) - Math.max(0, Math.floor(discount)))
}

/** Stored status + dates → what the subscription means right now. */
export function subscriptionState(sub: { status: string; endsAt: Date }, now = new Date()): SubscriptionState {
  if (sub.status === 'CANCELLED' || sub.status === 'SUSPENDED' || sub.status === 'PENDING') return sub.status
  return sub.endsAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE'
}

interface SubLike {
  planId: string | null
  status: string
  startsAt: Date
  endsAt: Date
  createdAt: Date
}

export interface AccessMirror {
  planId: string | null
  planStartedAt: Date | null
  planExpiresAt: Date | null
  status: string
}

/**
 * The Customer fields the login route and the access engine read, derived from the
 * subscription history + the admin-set account status.
 * - Any ACTIVE (paid-up, not expired) subscription grants access until the latest end
 *   date — a renewal that starts when the current period ends keeps access continuous.
 * - Otherwise the newest non-cancelled subscription explains why there is no access
 *   (EXPIRED / SUSPENDED / pending → INACTIVE).
 * - No subscription at all: the account stays usable (can log in) but has no plan.
 * - An archived / suspended account always wins.
 */
export function accessMirror(subs: SubLike[], accountStatus: string, now = new Date()): AccessMirror {
  let mirror: AccessMirror
  const active = subs.filter((s) => subscriptionState(s, now) === 'ACTIVE')

  if (active.length > 0) {
    const started = active.filter((s) => s.startsAt.getTime() <= now.getTime())
    const covering =
      [...started].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0] ??
      [...active].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0]
    const expires = Math.max(...active.map((s) => s.endsAt.getTime()))
    mirror = { planId: covering.planId, planStartedAt: covering.startsAt, planExpiresAt: new Date(expires), status: 'ACTIVE' }
  } else {
    const current = [...subs]
      .filter((s) => s.status !== 'CANCELLED')
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0]
    if (!current) {
      mirror = { planId: null, planStartedAt: null, planExpiresAt: null, status: 'ACTIVE' }
    } else {
      const state = subscriptionState(current, now)
      mirror = {
        planId: current.planId,
        planStartedAt: current.startsAt,
        planExpiresAt: current.endsAt,
        status: state === 'EXPIRED' ? 'EXPIRED' : state === 'SUSPENDED' ? 'SUSPENDED' : 'INACTIVE',
      }
    }
  }

  if (accountStatus === 'ARCHIVED' || accountStatus === 'SUSPENDED') mirror.status = accountStatus
  return mirror
}

/** One badge for a customer row. */
export function customerState(
  c: { status: string; accountStatus: string; planId: string | null; planExpiresAt: Date | null },
  now = new Date(),
): CustomerState {
  if (c.accountStatus === 'ARCHIVED') return 'ARCHIVED'
  if (c.accountStatus === 'SUSPENDED' || c.status === 'SUSPENDED') return 'SUSPENDED'
  if (!c.planId) return 'NO_SUBSCRIPTION'
  if (c.status === 'EXPIRED' || (c.planExpiresAt && c.planExpiresAt.getTime() <= now.getTime())) return 'EXPIRED'
  if (c.status === 'INACTIVE') return 'PENDING'
  return 'ACTIVE'
}

/** Prisma filter matching customerState() — archived customers are hidden unless asked for. */
export function customerStateWhere(state: string | null | undefined, now = new Date()): Prisma.CustomerWhereInput {
  switch (state) {
    case 'ACTIVE':
      return { accountStatus: 'ACTIVE', status: 'ACTIVE', planId: { not: null }, planExpiresAt: { gt: now } }
    case 'EXPIRING':
      return {
        accountStatus: 'ACTIVE',
        status: 'ACTIVE',
        planId: { not: null },
        planExpiresAt: { gt: now, lte: addDays(now, 7) },
      }
    case 'EXPIRED':
      return {
        accountStatus: 'ACTIVE',
        planId: { not: null },
        status: { not: 'SUSPENDED' },
        OR: [{ status: 'EXPIRED' }, { planExpiresAt: { lte: now } }],
      }
    case 'PENDING':
      return { accountStatus: 'ACTIVE', status: 'INACTIVE', planId: { not: null } }
    case 'SUSPENDED':
      return { accountStatus: { not: 'ARCHIVED' }, OR: [{ accountStatus: 'SUSPENDED' }, { status: 'SUSPENDED' }] }
    case 'NO_SUBSCRIPTION':
      return { accountStatus: 'ACTIVE', planId: null }
    case 'ARCHIVED':
      return { accountStatus: 'ARCHIVED' }
    default:
      return { accountStatus: { not: 'ARCHIVED' } }
  }
}

/** Prisma filter for the subscriptions list. */
export function subscriptionStateWhere(state: string | null | undefined, now = new Date()): Prisma.SubscriptionWhereInput {
  switch (state) {
    case 'ACTIVE':
      return { status: 'ACTIVE', endsAt: { gt: now } }
    case 'EXPIRING':
      return { status: 'ACTIVE', endsAt: { gt: now, lte: addDays(now, 7) } }
    case 'EXPIRED':
      return { status: 'ACTIVE', endsAt: { lte: now } }
    case 'PENDING':
    case 'SUSPENDED':
    case 'CANCELLED':
      return { status: state }
    case 'PAYMENT_PENDING':
      return { status: { not: 'CANCELLED' }, paymentStatus: { in: ['PENDING', 'PARTIALLY_PAID'] } }
    default:
      return {}
  }
}

/** Subscription payment status from its recorded payments. */
export function paymentStatusFor(amount: number, payments: { amount: number; status: string }[]): string {
  const counted = payments.filter((p) => p.status !== 'CANCELLED')
  if (counted.length === 0) return amount === 0 ? 'PAID' : 'NOT_RECORDED'
  const paid = counted.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0)
  if (counted.some((p) => p.status === 'PAID') && paid >= amount) return 'PAID'
  if (counted.some((p) => p.status === 'PENDING')) return 'PENDING'
  if (paid > 0) return 'PARTIALLY_PAID'
  if (counted.some((p) => p.status === 'REFUNDED')) return 'REFUNDED'
  if (counted.some((p) => p.status === 'FAILED')) return 'FAILED'
  return 'NOT_RECORDED'
}

/** Which manual payment status changes make sense. */
export function canChangePaymentStatus(from: string, to: string): boolean {
  if (from === to) return false
  switch (from) {
    case 'PENDING':
      return ['PAID', 'FAILED', 'CANCELLED'].includes(to)
    case 'FAILED':
      return ['PENDING', 'PAID', 'CANCELLED'].includes(to)
    case 'PAID':
      return to === 'REFUNDED'
    default:
      return false
  }
}
