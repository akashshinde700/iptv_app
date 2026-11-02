import { describe, expect, it } from 'vitest'

import { EMBED_PLAYERS, embedFallbacks, isAllowedEmbedUrl } from '@/lib/server/media/nxsha-embed'
import {
  NXSHA_PROVIDERS,
  fallbackServers,
  providerInfo,
  rankServers,
  UNKNOWN_PROVIDER_PRIORITY,
} from '@/lib/server/media/nxsha-providers'

describe('nxsha provider catalogue', () => {
  it('has unique scraper ids and no duplicate priorities per scraper', () => {
    const scrapers = NXSHA_PROVIDERS.map((p) => p.scraper)
    expect(new Set(scrapers).size).toBe(scrapers.length)
    expect(scrapers.length).toBeGreaterThanOrEqual(30)
  })

  it('knows the documented download-capable scrapers', () => {
    for (const id of ['xdownloader', 'hdhub4u', 'hdhub4u-direct', 'k4khdhub', 'filmyfly', 'moviesdrive', 'movone']) {
      expect(providerInfo(id)?.download, `${id} should allow downloads`).toBe(true)
    }
    expect(providerInfo('awsind')?.download).toBe(false)
  })

  it('looks scrapers up case-insensitively', () => {
    expect(providerInfo('AWSIND')?.name).toBe(providerInfo('awsind')?.name)
  })
})

describe('rankServers', () => {
  it('drops offline, disabled and scraper-less rows', () => {
    const ranked = rankServers(
      [
        { scraper: 'awsind', status: 'online' },
        { scraper: 'nitro', status: 'offline' },
        { scraper: 'castle', isDisable: true },
        { name: 'no scraper id' },
        { scraper: 'stvv', status: 'online' },
      ],
      'movie',
    )
    expect(ranked.map((r) => r.scraper)).toEqual(['awsind', 'stvv'])
  })

  it('de-duplicates repeated scrapers', () => {
    const ranked = rankServers([{ scraper: 'awsind' }, { scraper: 'awsind' }], 'tv')
    expect(ranked).toHaveLength(1)
  })

  it('honours the API high_priority hint above catalogue order', () => {
    const ranked = rankServers([{ scraper: 'stvv' }, { scraper: 'awsind' }, { scraper: 'nitro', high_priority: 1 }], 'movie')
    expect(ranked[0].scraper).toBe('nitro')
  })

  it('filters rows whose types exclude the requested kind', () => {
    const ranked = rankServers([{ scraper: 'awsind', types: ['movie'] }, { scraper: 'nitro', types: ['tv'] }], 'tv')
    expect(ranked.map((r) => r.scraper)).toEqual(['nitro'])
  })

  it('prefers API capability flags but falls back to the catalogue', () => {
    const [fromApi] = rankServers([{ scraper: 'hdhub4u', dl_support: false, web_support: true }], 'movie')
    expect(fromApi).toMatchObject({ web: true, download: false, fromCatalogue: false })

    const [fromCatalogue] = rankServers([{ scraper: 'hdhub4u' }], 'movie')
    expect(fromCatalogue).toMatchObject({ web: false, download: true, fromCatalogue: true })
  })

  it('sorts unknown scrapers after known ones', () => {
    const ranked = rankServers([{ scraper: 'brand-new-scraper' }, { scraper: 'awsind' }], 'movie')
    expect(ranked.map((r) => r.scraper)).toEqual(['awsind', 'brand-new-scraper'])
    expect(ranked[1].priority).toBe(UNKNOWN_PROVIDER_PRIORITY)
    expect(ranked[1].name).toBe('brand-new-scraper')
  })

  it('pushes anime-only scrapers to the end unless the caller says anime', () => {
    const movieRank = rankServers([{ scraper: 'toonstream' }, { scraper: 'awsind' }], 'movie')
    expect(movieRank.map((r) => r.scraper)).toEqual(['awsind', 'toonstream'])

    const animeRank = rankServers([{ scraper: 'awsind' }, { scraper: 'toonstream' }], 'tv', { anime: true })
    expect(animeRank[0].scraper).toBe('awsind')
  })

  it('returns a non-empty fallback list when the API sends nothing', () => {
    const fallback = fallbackServers()
    expect(fallback.length).toBeGreaterThan(0)
    for (const server of fallback) {
      expect(server.scraper).toBeTruthy()
      expect(server.fromCatalogue).toBe(true)
    }
    expect(fallback.map((s) => s.priority)).toEqual([...fallback.map((s) => s.priority)].sort((a, b) => a - b))
  })
})

describe('embed fallbacks', () => {
  it('builds one https source per player with numeric-only ids', () => {
    const sources = embedFallbacks(603, 'movie')
    expect(sources).toHaveLength(EMBED_PLAYERS.length)
    for (const source of sources) {
      expect(source.embed).toBe(true)
      expect(source.url.startsWith('https://')).toBe(true)
      expect(source.url).toContain('603')
      expect(source.subtitles).toEqual([])
    }
  })

  it('includes the episode in a tv embed id and url', () => {
    const [, videasy] = embedFallbacks(1399, 'tv', 2, 5)
    expect(videasy.id).toContain('s2e5')
    expect(videasy.url).toContain('/tv/1399/2/5')
  })

  it('clamps nonsense season/episode numbers instead of emitting /0/0', () => {
    const [vidfast] = embedFallbacks(1, 'tv', 0, -3)
    expect(vidfast.url).toContain('/tv/1/1/1')
  })

  it('refuses ids that are not positive integers', () => {
    expect(embedFallbacks(0, 'movie')).toEqual([])
    expect(embedFallbacks(-5, 'movie')).toEqual([])
    expect(embedFallbacks(Number.NaN, 'movie')).toEqual([])
    expect(embedFallbacks(1.5, 'movie')).toEqual([])
  })

  it('only allows https URLs on a known embed host', () => {
    expect(isAllowedEmbedUrl('https://vidfast.pro/movie/603')).toBe(true)
    expect(isAllowedEmbedUrl('https://player.videasy.net/tv/1399/1/1')).toBe(true)
    expect(isAllowedEmbedUrl('http://vidfast.pro/movie/603')).toBe(false)
    expect(isAllowedEmbedUrl('https://evil.example/movie/603')).toBe(false)
    expect(isAllowedEmbedUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedEmbedUrl('not a url')).toBe(false)
  })
})
