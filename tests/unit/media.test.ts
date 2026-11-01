import { describe, it, expect, vi } from 'vitest'

/* `epg.ts` imports the Prisma client at module scope; the parser itself needs no DB. */
vi.mock('@/lib/db', () => ({ db: { portal: { findMany: vi.fn(async () => []) } } }))

import { parseXmltv } from '@/lib/server/epg'
import { fixturesProvider } from '@/lib/server/media/fixtures'
import { mediaId, parseMediaId } from '@/lib/server/media/types'
import { xtreamSeriesEpisodeUrl } from '@/lib/server/sync/xtream'

const NOW = Date.parse('2026-11-01T20:00:00+05:30')

const XMLTV = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="test">
  <channel id="9xm.in"><display-name>9XM</display-name><display-name>9XM HD</display-name></channel>
  <channel id="ddnews.in"><display-name lang="hi">DD News</display-name></channel>
  <programme start="20261101193000 +0530" stop="20261101203000 +0530" channel="9xm.in">
    <title>Top 20 Countdown</title>
    <desc>Chart toppers &amp; more.</desc>
    <category>Music</category>
  </programme>
  <programme start="20261101203000 +0530" stop="20261101210000 +0530" channel="9xm.in">
    <title>Late Night Beats</title>
  </programme>
  <!-- far outside the kept window -->
  <programme start="20260101120000 +0530" stop="20260101130000 +0530" channel="9xm.in">
    <title>Ancient Rerun</title>
  </programme>
  <programme start="20261101200000 +0530" stop="20261101203000 +0530" channel="ddnews.in">
    <title>News at 8</title>
  </programme>
</tv>`

describe('parseXmltv', () => {
  const guide = parseXmltv(XMLTV, NOW)

  it('indexes channel display names', () => {
    expect(guide.channelNames.get('9xm.in')).toEqual(['9XM', '9XM HD'])
    expect(guide.byDisplayName.get('9xm')).toBe('9xm.in')
  })

  it('parses programmes with timezone-aware start/stop', () => {
    const programmes = guide.programmes.get('9xm.in') ?? []
    expect(programmes.map((p) => p.title)).toEqual(['Top 20 Countdown', 'Late Night Beats'])
    expect(programmes[0].start).toBe(Date.parse('2026-11-01T19:30:00+05:30'))
    expect(programmes[0].stop).toBe(Date.parse('2026-11-01T20:30:00+05:30'))
    expect(programmes[0].category).toBe('Music')
  })

  it('decodes entities and drops programmes outside the window', () => {
    const programmes = guide.programmes.get('9xm.in') ?? []
    expect(programmes[0].description).toBe('Chart toppers & more.')
    expect(programmes.some((p) => p.title === 'Ancient Rerun')).toBe(false)
  })

  it('sorts programmes by start time', () => {
    const programmes = guide.programmes.get('9xm.in') ?? []
    expect(programmes[0].start).toBeLessThan(programmes[1].start)
  })
})

describe('media ids', () => {
  it('round-trips provider-qualified ids', () => {
    const id = mediaId('catalog', 'series', 'clx123')
    expect(id).toBe('catalog:series:clx123')
    expect(parseMediaId(id)).toEqual({ provider: 'catalog', kind: 'series', ref: 'clx123' })
  })

  it('keeps colons that belong to the ref', () => {
    expect(parseMediaId('nxsha:movie:1400940')).toEqual({ provider: 'nxsha', kind: 'movie', ref: '1400940' })
  })

  it('rejects unknown providers and kinds', () => {
    expect(parseMediaId('piracy:movie:1')).toBeNull()
    expect(parseMediaId('catalog:audiobook:1')).toBeNull()
    expect(parseMediaId('catalog:movie:')).toBeNull()
  })
})

describe('fixture media provider', () => {
  const ctx = { organizationId: 'fixtures' }

  it('serves a hero and rails shaped exactly like the catalog provider', async () => {
    const home = await fixturesProvider.home(ctx, 'home')
    expect(home.provider).toBe('catalog')
    expect(home.hero.length).toBeGreaterThan(0)
    expect(home.rails.length).toBeGreaterThan(0)
    for (const card of home.hero) {
      expect(card.id.startsWith('catalog:')).toBe(true)
      expect(['movie', 'series']).toContain(card.kind)
      expect(card.title.length).toBeGreaterThan(0)
    }
  })

  it('filters rails by tab', async () => {
    const movies = await fixturesProvider.home(ctx, 'movies')
    expect(movies.rails.every((rail) => rail.items.every((item) => item.kind === 'movie'))).toBe(true)
    const series = await fixturesProvider.home(ctx, 'series')
    expect(series.rails.every((rail) => rail.items.every((item) => item.kind === 'series'))).toBe(true)
  })

  it('returns seasons for a series and a play URL for a movie', async () => {
    const series = await fixturesProvider.detail(ctx, 'catalog:series:fx-07')
    expect(series?.seasons.length).toBeGreaterThan(1)
    expect(series?.seasons[0].episodes[0].episode).toBe(1)
    const movie = await fixturesProvider.detail(ctx, 'catalog:movie:fx-01')
    expect(movie?.playUrl?.startsWith('/api/proxy?t=')).toBe(true)
    expect(movie?.seasons).toEqual([])
  })

  it('never leaks a raw upstream URL — sources are opaque proxy paths', async () => {
    const sources = await fixturesProvider.sources(ctx, 'catalog:movie:fx-01')
    expect(sources?.sources.length).toBeGreaterThan(0)
    for (const source of sources!.sources) {
      expect(source.url.startsWith('/api/proxy?t=')).toBe(true)
      expect(source.url).not.toContain('http')
    }
  })

  it('searches by title', async () => {
    const hits = await fixturesProvider.search(ctx, 'neon')
    expect(hits.map((h) => h.title)).toContain('Neon Monsoon')
    expect(await fixturesProvider.search(ctx, 'zzzzz')).toEqual([])
  })
})

describe('xtream series URLs', () => {
  it('builds a series episode URL without leaking into the client', () => {
    const url = xtreamSeriesEpisodeUrl('http://panel.example:8080/', 'user', 'pass', '998877', '.mkv')
    expect(url).toBe('http://panel.example:8080/series/user/pass/998877.mkv')
  })

  it('defaults the container to mp4', () => {
    expect(xtreamSeriesEpisodeUrl('http://panel', 'u', 'p', '1', null)).toBe('http://panel/series/u/p/1.mp4')
  })
})
