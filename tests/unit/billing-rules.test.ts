import { describe, it, expect } from 'vitest'
import {
  accessMirror,
  addDays,
  canChangePaymentStatus,
  customerState,
  finalAmount,
  paymentStatusFor,
  subscriptionState,
} from '@/lib/server/billing-rules'

const now = new Date('2026-09-14T12:00:00Z')
const sub = (o: Partial<{ planId: string | null; status: string; startsAt: Date; endsAt: Date; createdAt: Date }> = {}) => ({
  planId: 'plan_pro',
  status: 'ACTIVE',
  startsAt: addDays(now, -10),
  endsAt: addDays(now, 20),
  createdAt: addDays(now, -10),
  ...o,
})

describe('subscriptionState', () => {
  it('derives EXPIRED from the end date, never from the client', () => {
    expect(subscriptionState(sub(), now)).toBe('ACTIVE')
    expect(subscriptionState(sub({ endsAt: now }), now)).toBe('EXPIRED')
  })
  it('keeps admin states as they are', () => {
    expect(subscriptionState(sub({ status: 'SUSPENDED' }), now)).toBe('SUSPENDED')
    expect(subscriptionState(sub({ status: 'CANCELLED' }), now)).toBe('CANCELLED')
    expect(subscriptionState(sub({ status: 'PENDING' }), now)).toBe('PENDING')
  })
})

describe('accessMirror (what login + the access engine read)', () => {
  it('grants access for an active subscription', () => {
    const m = accessMirror([sub()], 'ACTIVE', now)
    expect(m.status).toBe('ACTIVE')
    expect(m.planId).toBe('plan_pro')
    expect(m.planExpiresAt).toEqual(addDays(now, 20))
  })

  it('keeps access continuous across a paid-ahead renewal', () => {
    const current = sub()
    const renewal = sub({ startsAt: current.endsAt, endsAt: addDays(current.endsAt, 30), createdAt: now })
    const m = accessMirror([current, renewal], 'ACTIVE', now)
    expect(m.status).toBe('ACTIVE')
    expect(m.planExpiresAt).toEqual(renewal.endsAt)
    expect(m.planStartedAt).toEqual(current.startsAt)
  })

  it('blocks expired, suspended and pending subscriptions', () => {
    expect(accessMirror([sub({ endsAt: addDays(now, -1) })], 'ACTIVE', now).status).toBe('EXPIRED')
    expect(accessMirror([sub({ status: 'SUSPENDED' })], 'ACTIVE', now).status).toBe('SUSPENDED')
    expect(accessMirror([sub({ status: 'PENDING' })], 'ACTIVE', now).status).toBe('INACTIVE')
  })

  it('a cancelled-only history means no plan at all', () => {
    const m = accessMirror([sub({ status: 'CANCELLED' })], 'ACTIVE', now)
    expect(m).toEqual({ planId: null, planStartedAt: null, planExpiresAt: null, status: 'ACTIVE' })
  })

  it('an unpaid renewal does not cut off the period that is already paid', () => {
    const current = sub()
    const pendingRenewal = sub({ status: 'PENDING', startsAt: current.endsAt, endsAt: addDays(current.endsAt, 30), createdAt: now })
    expect(accessMirror([current, pendingRenewal], 'ACTIVE', now).status).toBe('ACTIVE')
  })

  it('an admin-suspended or archived account always wins', () => {
    expect(accessMirror([sub()], 'SUSPENDED', now).status).toBe('SUSPENDED')
    expect(accessMirror([sub()], 'ARCHIVED', now).status).toBe('ARCHIVED')
  })
})

describe('customerState', () => {
  const base = { status: 'ACTIVE', accountStatus: 'ACTIVE', planId: 'p', planExpiresAt: addDays(now, 5) }
  it('labels every combination', () => {
    expect(customerState(base, now)).toBe('ACTIVE')
    expect(customerState({ ...base, planExpiresAt: addDays(now, -1) }, now)).toBe('EXPIRED')
    expect(customerState({ ...base, status: 'INACTIVE' }, now)).toBe('PENDING')
    expect(customerState({ ...base, planId: null }, now)).toBe('NO_SUBSCRIPTION')
    expect(customerState({ ...base, accountStatus: 'SUSPENDED' }, now)).toBe('SUSPENDED')
    expect(customerState({ ...base, accountStatus: 'ARCHIVED' }, now)).toBe('ARCHIVED')
  })
})

describe('payments', () => {
  it('computes the final amount', () => {
    expect(finalAmount(199, 50)).toBe(149)
    expect(finalAmount(99, 500)).toBe(0)
  })

  it('derives the subscription payment status', () => {
    expect(paymentStatusFor(199, [])).toBe('NOT_RECORDED')
    expect(paymentStatusFor(0, [])).toBe('PAID')
    expect(paymentStatusFor(199, [{ amount: 199, status: 'PAID' }])).toBe('PAID')
    expect(paymentStatusFor(199, [{ amount: 100, status: 'PAID' }])).toBe('PARTIALLY_PAID')
    expect(paymentStatusFor(199, [{ amount: 199, status: 'PENDING' }])).toBe('PENDING')
    expect(paymentStatusFor(199, [{ amount: 199, status: 'REFUNDED' }])).toBe('REFUNDED')
    expect(paymentStatusFor(199, [{ amount: 199, status: 'FAILED' }])).toBe('FAILED')
    expect(paymentStatusFor(199, [{ amount: 199, status: 'CANCELLED' }])).toBe('NOT_RECORDED')
  })

  it('only allows sensible manual status changes', () => {
    expect(canChangePaymentStatus('PENDING', 'PAID')).toBe(true)
    expect(canChangePaymentStatus('PAID', 'REFUNDED')).toBe(true)
    expect(canChangePaymentStatus('PAID', 'PENDING')).toBe(false)
    expect(canChangePaymentStatus('REFUNDED', 'PAID')).toBe(false)
  })
})
