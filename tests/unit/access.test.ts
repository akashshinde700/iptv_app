import { describe, it, expect, vi, beforeEach } from 'vitest'

/* Mock the Prisma client before importing the module under test. */
const customerFindUnique = vi.fn()
const customerUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    customer: {
      findUnique: (...a: unknown[]) => customerFindUnique(...a),
      update: (...a: unknown[]) => customerUpdate(...a),
    },
  },
}))

import { evaluateAccess, buildCustomerChannelWhere } from '@/lib/server/access'

const future = new Date(Date.now() + 86_400_000)
const past = new Date(Date.now() - 86_400_000)

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust_1',
    organizationId: 'org_1',
    status: 'ACTIVE',
    planExpiresAt: future,
    plan: {
      isActive: true,
      allowAdult: false,
      validTo: null,
      regions: '|Asia|',
      countries: '|IN|',
      languages: '|Hindi|',
      categories: '|',
      name: 'Pro',
      planChannels: [],
    },
    overrides: [],
    ...overrides,
  }
}

beforeEach(() => {
  customerFindUnique.mockReset()
  customerUpdate.mockReset()
})

describe('evaluateAccess', () => {
  it('denies a guest', async () => {
    const s = await evaluateAccess(null)
    expect(s.hasAccess).toBe(false)
    expect(s.reason).toBe('Login required')
  })

  it('denies an unknown customer', async () => {
    customerFindUnique.mockResolvedValue(null)
    expect((await evaluateAccess('x')).reason).toBe('Customer not found')
  })

  it('denies a suspended customer', async () => {
    customerFindUnique.mockResolvedValue(customer({ status: 'SUSPENDED' }))
    const s = await evaluateAccess('cust_1')
    expect(s.hasAccess).toBe(false)
    expect(s.organizationId).toBe('org_1')
  })

  it('denies when no plan is assigned', async () => {
    customerFindUnique.mockResolvedValue(customer({ plan: null }))
    expect((await evaluateAccess('cust_1')).reason).toBe('No plan assigned')
  })

  it('auto-flips an ACTIVE customer whose plan date has passed to EXPIRED', async () => {
    customerUpdate.mockResolvedValue({})
    customerFindUnique.mockResolvedValue(customer({ planExpiresAt: past }))
    const s = await evaluateAccess('cust_1')
    expect(s.hasAccess).toBe(false)
    expect(customerUpdate).toHaveBeenCalledWith({ where: { id: 'cust_1' }, data: { status: 'EXPIRED' } })
  })

  it('denies when the plan validity window has closed', async () => {
    customerFindUnique.mockResolvedValue(
      customer({ plan: { ...customer().plan, validTo: past } }),
    )
    expect((await evaluateAccess('cust_1')).reason).toBe('Plan expired')
  })

  it('grants access on the happy path', async () => {
    customerFindUnique.mockResolvedValue(customer())
    const s = await evaluateAccess('cust_1')
    expect(s.hasAccess).toBe(true)
    expect(s.organizationId).toBe('org_1')
    expect(s.regions).toEqual(['Asia'])
    expect(s.allowAdult).toBe(false)
  })
})

describe('buildCustomerChannelWhere', () => {
  it('returns an impossible where for denied access', async () => {
    customerFindUnique.mockResolvedValue(null)
    const { where } = await buildCustomerChannelWhere('x')
    expect(where).toEqual({ id: { in: ['__none__'] } })
  })

  it('scopes to the org, active channels, and plan dimensions', async () => {
    customerFindUnique.mockResolvedValue(customer())
    const { where } = await buildCustomerChannelWhere('cust_1')
    const and = (where.AND ?? []) as Record<string, unknown>[]
    expect(and).toContainEqual({ organizationId: 'org_1' })
    expect(and).toContainEqual({ isActive: true })
    expect(and).toContainEqual({ region: { in: ['Asia'] } })
    expect(and).toContainEqual({ isNsfw: false })
  })
})
