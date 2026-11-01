import { describe, it, expect, vi } from 'vitest'

/* iptv.ts imports the Prisma client at module scope; the logic under test is pure. */
vi.mock('@/lib/db', () => ({ db: {} }))

import { splitPipe, qualityRank, sortStreams, pickBestStream, buildChannelWhere, parseListParams } from '@/lib/server/iptv'
import { regionForCountry } from '@/lib/server/regions'

describe('splitPipe', () => {
  it('splits a pipe column, trims, drops empties', () => {
    expect(splitPipe('|news| movies |')).toEqual(['news', 'movies'])
    expect(splitPipe('|')).toEqual([])
    expect(splitPipe(null)).toEqual([])
  })
})

describe('qualityRank', () => {
  it('parses a leading number', () => {
    expect(qualityRank('1080p')).toBe(1080)
    expect(qualityRank('720')).toBe(720)
    expect(qualityRank(null)).toBe(-1)
    expect(qualityRank('HD')).toBe(0)
  })
})

describe('sortStreams', () => {
  it('HLS first, then higher quality, then has-quality', () => {
    const streams = [
      { url: 'http://x/a.ts', quality: '1080p' },
      { url: 'http://x/b.m3u8', quality: '480p' },
      { url: 'http://x/c.m3u8', quality: '1080p' },
      { url: 'http://x/d.m3u8', quality: null },
    ]
    const sorted = sortStreams(streams)
    expect(sorted[0].url).toBe('http://x/c.m3u8') // hls + 1080
    expect(sorted[1].url).toBe('http://x/b.m3u8') // hls + 480
    expect(sorted[2].url).toBe('http://x/d.m3u8') // hls + no quality
    expect(sorted[3].url).toBe('http://x/a.ts') // non-hls last
  })
})

describe('pickBestStream', () => {
  it('returns a signed proxy path and hides the raw url', () => {
    const best = pickBestStream([
      { id: 's1', url: 'http://cdn/live/USER/PASS/1.m3u8', quality: '1080p', title: null, referrer: 'r', userAgent: 'u' },
    ] as never)
    expect(best).not.toBeNull()
    expect(best!.url).toMatch(/^\/api\/proxy\?/)
    expect(best!.url).not.toContain('USER/PASS')
    expect(best!.referrer).toBeNull()
    expect(best!.userAgent).toBeNull()
  })

  it('returns null for no streams', () => {
    expect(pickBestStream([])).toBeNull()
  })
})

describe('buildChannelWhere', () => {
  it('always scopes to the organization and active channels', () => {
    const w = buildChannelWhere({}, 'org_123')
    expect(w.organizationId).toBe('org_123')
    expect(w.isActive).toBe(true)
    expect(w.isNsfw).toBe(false) // nsfw excluded by default
  })

  it('includes NSFW only when asked', () => {
    expect(buildChannelWhere({ nsfw: true }, 'o').isNsfw).toBeUndefined()
  })
})

describe('parseListParams', () => {
  it('clamps pageSize and normalizes', () => {
    const p = parseListParams(new URLSearchParams('page=-5&pageSize=9999&sort=weird'))
    expect(p.page).toBe(1)
    expect(p.pageSize).toBe(100)
    expect(p.sort).toBe('name')
  })
})

describe('regionForCountry', () => {
  it('maps known codes', () => {
    expect(regionForCountry('IN')).toBe('Asia')
    expect(regionForCountry('US')).toBe('North America')
  })
  it('returns null for unknown / nullish', () => {
    expect(regionForCountry('ZZ')).toBeNull()
    expect(regionForCountry(null)).toBeNull()
  })
})
