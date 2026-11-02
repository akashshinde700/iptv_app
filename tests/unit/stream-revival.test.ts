import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * BUG-07: an operator switching a source off used to be undone automatically — the health sweep
 * set the stream back to ACTIVE on the next successful probe, and the player's own "ok" report did
 * the same. `disabledBy` now separates "the system gave up on it" from "a person turned it off".
 */

const streamUpdate = vi.fn(async () => ({}))

vi.mock('@/lib/db', () => ({
  db: {
    stream: {
      update: (...args: unknown[]) => streamUpdate(...args),
      findMany: async () => [],
      count: async () => 0,
    },
    channel: { findMany: async () => [], update: async () => ({}) },
    syncLog: { create: async () => ({}) },
  },
}))

vi.mock('@/lib/server/net-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/net-guard')>('@/lib/server/net-guard')
  return actual
})

import { canProbeRevive, recordProbe } from '@/lib/server/health-doctor'

beforeEach(() => {
  streamUpdate.mockClear()
})

describe('canProbeRevive', () => {
  it('lets a passing probe recover an automatically disabled source', () => {
    expect(canProbeRevive({ status: 'DISABLED', disabledBy: 'AUTO' })).toBe(true)
    // Legacy rows predate the column: they were all disabled by the sweep.
    expect(canProbeRevive({ status: 'DISABLED', disabledBy: null })).toBe(true)
    expect(canProbeRevive({ status: 'DISABLED' })).toBe(true)
  })

  it('never overrides an operator switch', () => {
    expect(canProbeRevive({ status: 'DISABLED', disabledBy: 'OPERATOR' })).toBe(false)
  })

  it('is always true for a stream that is not disabled', () => {
    expect(canProbeRevive({ status: 'ACTIVE', disabledBy: null })).toBe(true)
    expect(canProbeRevive({ status: 'ACTIVE', disabledBy: 'OPERATOR' })).toBe(true)
  })
})

describe('recordProbe', () => {
  it('revives an auto-disabled stream when the probe succeeds', async () => {
    const result = await recordProbe(
      { id: 's1', failureCount: 5, status: 'DISABLED', disabledBy: 'AUTO' },
      { ok: true, detail: 'ok', latencyMs: 40 },
    )
    expect(result.status).toBe('ACTIVE')
    expect(result.changed).toBe(true)
    expect(streamUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', failureCount: 0 }) }),
    )
  })

  it('leaves an operator-disabled stream disabled even though it answered', async () => {
    const result = await recordProbe(
      { id: 's1', failureCount: 0, status: 'DISABLED', disabledBy: 'OPERATOR' },
      { ok: true, detail: 'ok', latencyMs: 40 },
    )
    expect(result.status).toBe('DISABLED')
    expect(result.changed).toBe(false)
    const data = (streamUpdate.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> }
    expect(data.data.status).toBeUndefined()
    expect(data.data.lastOkAt).toBeInstanceOf(Date)
  })

  it('marks an automatic disable as AUTO when the failure threshold is reached', async () => {
    await recordProbe(
      { id: 's1', failureCount: 4, status: 'ACTIVE', disabledBy: null },
      { ok: false, detail: 'unreachable', latencyMs: null },
    )
    const data = (streamUpdate.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> }
    expect(data.data.status).toBe('DISABLED')
    expect(data.data.disabledBy).toBe('AUTO')
  })

  it('does not disable before the threshold', async () => {
    const result = await recordProbe(
      { id: 's1', failureCount: 1, status: 'ACTIVE', disabledBy: null },
      { ok: false, detail: 'timeout', latencyMs: null },
    )
    expect(result.status).toBe('ACTIVE')
    const data = (streamUpdate.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> }
    expect(data.data.status).toBeUndefined()
  })
})
