import { describe, it, expect, vi } from 'vitest'

/* Modules here import the Prisma client at module scope; the logic under test is pure. */
vi.mock('@/lib/db', () => ({ db: {} }))

import { sortStreams } from '@/lib/server/iptv'
import { isPublicHttpUrl } from '@/lib/server/net-guard'
import { absolutize, playlistToken, playlistPath, playlistUrl, verifyPlaylistToken } from '@/lib/server/playlist'

const now = Date.now()
const minuteAgo = new Date(now - 60_000)
const dayAgo = new Date(now - 26 * 60 * 60 * 1000)

function stream(overrides: Partial<Parameters<typeof sortStreams>[0][number]> = {}) {
  return {
    id: 's',
    url: 'https://example.com/live/index.m3u8',
    quality: null as string | null,
    status: 'ACTIVE',
    priority: 100,
    failureCount: 0,
    lastOkAt: null as Date | null,
    lastFailureAt: null as Date | null,
    ...overrides,
  }
}

describe('stream ranking (auto server picking)', () => {
  it('puts a source that worked a minute ago ahead of one that has never played', () => {
    const fresh = stream({ id: 'fresh', lastOkAt: minuteAgo })
    const unknown = stream({ id: 'unknown' })
    expect(sortStreams([unknown, fresh])[0].id).toBe('fresh')
  })

  it('prefers the source with the fewest failures when both are cold', () => {
    const flaky = stream({ id: 'flaky', failureCount: 3 })
    const clean = stream({ id: 'clean', failureCount: 0 })
    expect(sortStreams([flaky, clean])[0].id).toBe('clean')
  })

  it('never prefers an auto-disabled source while a live one exists', () => {
    const dead = stream({ id: 'dead', status: 'DISABLED', lastOkAt: minuteAgo, priority: 1 })
    const live = stream({ id: 'live', priority: 500, lastOkAt: dayAgo })
    expect(sortStreams([dead, live])[0].id).toBe('live')
  })

  it('still honours operator priority when health is equal', () => {
    const pinned = stream({ id: 'pinned', priority: 1, lastOkAt: minuteAgo })
    const other = stream({ id: 'other', priority: 100, lastOkAt: minuteAgo })
    expect(sortStreams([other, pinned])[0].id).toBe('pinned')
  })
})

describe('probe target guard', () => {
  it('accepts public http(s) hosts', () => {
    expect(isPublicHttpUrl('https://cdn.example.com/live.m3u8')).toBe(true)
    expect(isPublicHttpUrl('http://8.8.8.8/stream.ts')).toBe(true)
  })

  it('refuses localhost, private ranges, metadata and non-http schemes', () => {
    for (const url of [
      'http://localhost:8080/x.m3u8',
      'http://127.0.0.1/x.ts',
      'http://10.1.2.3/x.m3u8',
      'http://192.168.0.5/x.m3u8',
      'http://169.254.169.254/latest/meta-data',
      'http://172.20.1.1/x',
      'ftp://example.com/x.m3u8',
      'not a url',
      '',
    ]) {
      expect(isPublicHttpUrl(url)).toBe(false)
    }
  })
})

describe('personal playlist links', () => {
  const customerId = 'clx7f2k9b0000abcd1234efgh'

  it('round-trips the customer id', () => {
    expect(verifyPlaylistToken(playlistToken(customerId))).toBe(customerId)
  })

  it('is stable, so a customer can paste it once and keep it', () => {
    expect(playlistToken(customerId)).toBe(playlistToken(customerId))
  })

  it('is opaque (no raw customer id in the URL)', () => {
    expect(playlistToken(customerId)).not.toContain(customerId)
    expect(playlistPath(customerId)).toMatch(/^\/api\/playlist\/[\w-]+\/streamkaro\.m3u$/)
  })

  it('rejects a tampered token', () => {
    const token = playlistToken(customerId)
    const other = playlistToken('clxOTHER')
    expect(verifyPlaylistToken(token.slice(0, -3) + 'aaa')).toBeNull()
    expect(verifyPlaylistToken(`${token}x`)).toBeNull()
    expect(verifyPlaylistToken(other)).toBe('clxOTHER')
    expect(verifyPlaylistToken('')).toBeNull()
    expect(verifyPlaylistToken('not-base64-!!')).toBeNull()
  })

  it('builds an absolute URL from the request origin', () => {
    expect(playlistUrl('https://tv.example.com/', customerId)).toBe(
      `https://tv.example.com${playlistPath(customerId)}`,
    )
  })
})

describe('playlist text', () => {
  it('absolutizes only proxy paths, leaving directives alone', () => {
    const body = '#EXTM3U\n#EXTINF:-1,News\n/api/proxy?t=abc\nhttps://cdn.example.com/x.m3u8'
    const out = absolutize(body, 'https://tv.example.com')
    expect(out).toContain('https://tv.example.com/api/proxy?t=abc')
    expect(out).toContain('https://cdn.example.com/x.m3u8')
    expect(out).toContain('#EXTM3U')
  })
})

/* -------------------------------------------------------------------------- */
/*  Health doctor state machine (Prisma mocked with in-memory rows)           */
/* -------------------------------------------------------------------------- */

type ChannelRow = {
  id: string
  isActive: boolean
  isDemo: boolean
  autoHiddenAt: Date | null
  healthStatus: string
}
type StreamRow = { id: string; channelId: string; status: string; failureCount: number }

const state = {
  channels: [] as ChannelRow[],
  streams: [] as StreamRow[],
  updates: [] as { id: string; data: Record<string, unknown> }[],
}

vi.mock('@/lib/db', () => ({
  db: {
    stream: {
      groupBy: async ({ where }: { where: { channelId: { in: string[] } } }) => {
        const byKey = new Map<string, number>()
        for (const s of state.streams) {
          if (!where.channelId.in.includes(s.channelId)) continue
          const key = `${s.channelId}|${s.status}`
          byKey.set(key, (byKey.get(key) ?? 0) + 1)
        }
        return [...byKey.entries()].map(([key, count]) => {
          const [channelId, status] = key.split('|')
          return { channelId, status, _count: { _all: count } }
        })
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const stream = state.streams.find((s) => s.id === where.id)
        if (stream) Object.assign(stream, data)
        return stream
      },
      findMany: async () => [],
      count: async () => 0,
      findFirst: async () => null,
    },
    channel: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        state.channels.filter((c) => where.id.in.includes(c.id)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const channel = state.channels.find((c) => c.id === where.id)
        if (channel) Object.assign(channel, data)
        state.updates.push({ id: where.id, data })
        return channel
      },
      count: async () => 0,
      groupBy: async () => [],
    },
  },
}))

import { recordProbe, refreshChannelHealth } from '@/lib/server/health-doctor'

function reset(streams: StreamRow[], channels: ChannelRow[]) {
  state.streams = streams
  state.channels = channels
  state.updates = []
}

describe('recordProbe', () => {
  it('resets the failure streak and revives a disabled source on success', async () => {
    reset([{ id: 's1', channelId: 'c1', status: 'DISABLED', failureCount: 4 }], [])
    const result = await recordProbe({ id: 's1', status: 'DISABLED', failureCount: 4 }, { ok: true, detail: 'HLS 3 entries', latencyMs: 90 })
    expect(result.status).toBe('ACTIVE')
    expect(state.streams[0]).toMatchObject({ status: 'ACTIVE', failureCount: 0 })
  })

  it('disables a source only once the failure threshold is reached', async () => {
    reset([{ id: 's1', channelId: 'c1', status: 'ACTIVE', failureCount: 3 }], [])
    const still = await recordProbe({ id: 's1', status: 'ACTIVE', failureCount: 3 }, { ok: false, detail: 'HTTP 403', latencyMs: 40 })
    expect(still.status).toBe('ACTIVE') // 4th failure: counted, not yet disabled
    expect(state.streams[0].failureCount).toBe(4)

    const disabled = await recordProbe({ id: 's1', status: 'ACTIVE', failureCount: 4 }, { ok: false, detail: 'timeout', latencyMs: null })
    expect(disabled.status).toBe('DISABLED')
    expect(state.streams[0].status).toBe('DISABLED')
  })
})

describe('refreshChannelHealth', () => {
  const baseChannel: ChannelRow = { id: 'c1', isActive: true, isDemo: false, autoHiddenAt: null, healthStatus: 'UNKNOWN' }

  it('reports OK when every source works', async () => {
    reset(
      [
        { id: 's1', channelId: 'c1', status: 'ACTIVE', failureCount: 0 },
        { id: 's2', channelId: 'c1', status: 'ACTIVE', failureCount: 0 },
      ],
      [{ ...baseChannel }],
    )
    const [result] = await refreshChannelHealth(['c1'])
    expect(result).toMatchObject({ health: 'OK', active: 2, disabled: 0, hidden: false })
    expect(state.channels[0].isActive).toBe(true)
  })

  it('reports DEGRADED but stays visible when one source survives', async () => {
    reset(
      [
        { id: 's1', channelId: 'c1', status: 'ACTIVE', failureCount: 0 },
        { id: 's2', channelId: 'c1', status: 'DISABLED', failureCount: 5 },
      ],
      [{ ...baseChannel }],
    )
    const [result] = await refreshChannelHealth(['c1'])
    expect(result).toMatchObject({ health: 'DEGRADED', active: 1, disabled: 1, hidden: false })
    expect(state.channels[0].isActive).toBe(true)
  })

  it('auto-hides a channel that has no working source left', async () => {
    reset([{ id: 's1', channelId: 'c1', status: 'DISABLED', failureCount: 5 }], [{ ...baseChannel }])
    const [result] = await refreshChannelHealth(['c1'])
    expect(result).toMatchObject({ health: 'DEAD', hidden: true })
    expect(state.channels[0].isActive).toBe(false)
    expect(state.channels[0].autoHiddenAt).toBeInstanceOf(Date)
  })

  it('restores an auto-hidden channel as soon as a source works again', async () => {
    reset(
      [{ id: 's1', channelId: 'c1', status: 'ACTIVE', failureCount: 0 }],
      [{ ...baseChannel, isActive: false, autoHiddenAt: new Date(), healthStatus: 'DEAD' }],
    )
    const [result] = await refreshChannelHealth(['c1'])
    expect(result).toMatchObject({ health: 'OK', restored: true })
    expect(state.channels[0].isActive).toBe(true)
    expect(state.channels[0].autoHiddenAt).toBeNull()
  })

  it('never auto-hides a demo channel (free showcase)', async () => {
    reset([{ id: 's1', channelId: 'c1', status: 'DISABLED', failureCount: 5 }], [{ ...baseChannel, isDemo: true }])
    const [result] = await refreshChannelHealth(['c1'])
    expect(result).toMatchObject({ health: 'DEAD', hidden: false })
    expect(state.channels[0].isActive).toBe(true)
  })

  it('does nothing for an unknown channel id', async () => {
    reset([], [])
    expect(await refreshChannelHealth(['nope'])).toEqual([])
    expect(await refreshChannelHealth([])).toEqual([])
  })
})
