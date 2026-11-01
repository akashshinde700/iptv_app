import { describe, it, expect } from 'vitest'
import { parseDateFromText, parseBulkText, keyForEntry } from '@/lib/server/bulk-import'

describe('parseDateFromText', () => {
  const cases: [string, string][] = [
    ['Expired on September 7, 2025', '2025-09-07'],
    ['April 1, 2026, 12:00 am', '2026-04-01'],
    ['12.01.2027', '2027-01-12'], // DD.MM.YYYY
    ['7/30/2027 9:54:42 AM', '2027-07-30'], // M/D/YYYY
    ['2026-12-11', '2026-12-11'], // ISO
    ['Apr 1 2026', '2026-04-01'],
  ]
  for (const [input, expectedIso] of cases) {
    it(`parses "${input}"`, () => {
      const r = parseDateFromText(input)
      expect(r).not.toBeNull()
      expect(r!.date.toISOString().slice(0, 10)).toBe(expectedIso)
    })
  }

  it('returns null for junk', () => {
    expect(parseDateFromText('no date here, just words')).toBeNull()
    expect(parseDateFromText('99.99.9999')).toBeNull()
  })
})

describe('parseBulkText', () => {
  it('parses an Xtream get.php link with credentials + forward expiry', () => {
    const text = [
      'http://line.example.com:8080/get.php?username=alice&password=secret123&type=m3u_plus',
      'Expired on : December 11, 2026',
    ].join('\n')
    const { entries, stats } = parseBulkText(text)
    expect(stats.xtream).toBe(1)
    expect(entries[0]).toMatchObject({
      type: 'XTREAM',
      username: 'alice',
      password: 'secret123',
      url: 'http://line.example.com:8080',
    })
    expect(entries[0].expiresAt?.toISOString().slice(0, 10)).toBe('2026-12-11')
  })

  it('parses a Stalker portal followed by MAC lines', () => {
    const text = [
      'http://portal.example.com/c/',
      '00:1A:79:AA:BB:CC 2027-01-15',
      '00:1A:79:AA:BB:DD',
      '2028-02-20',
    ].join('\n')
    const { entries, stats } = parseBulkText(text)
    expect(stats.stalker).toBe(2)
    expect(entries[0]).toMatchObject({ type: 'STALKER', macAddress: '00:1A:79:AA:BB:CC' })
    expect(entries[0].expiresAt?.toISOString().slice(0, 10)).toBe('2027-01-15')
    expect(entries[1].expiresAt?.toISOString().slice(0, 10)).toBe('2028-02-20')
  })

  it('treats a get.php link without credentials as M3U_URL', () => {
    const { entries, stats } = parseBulkText('http://host.example.com:8080/get.php?type=m3u_plus&output=ts')
    expect(stats.m3u).toBe(1)
    expect(entries[0].type).toBe('M3U_URL')
  })

  it('dedupes identical portal+MAC pairs within the blob', () => {
    const text = [
      'http://p.example.com/c/',
      '00:1A:79:AA:BB:CC',
      '00:1A:79:AA:BB:CC',
    ].join('\n')
    const { entries } = parseBulkText(text)
    expect(entries).toHaveLength(1)
  })

  it('skips junk / promo lines and counts them', () => {
    const text = [
      '🔥 BEST IPTV 🔥',
      'https://t.me/somechannel',
      'download: https://mediafire.com/file/x',
      'http://real.example.com/get.php?username=u&password=p',
    ].join('\n')
    const { entries, skippedLines } = parseBulkText(text)
    expect(entries).toHaveLength(1)
    expect(skippedLines).toBeGreaterThan(0)
  })

  it('caps at MAX_ENTRIES and MAX_TEXT_LENGTH without throwing', () => {
    const huge = Array.from({ length: 5000 }, (_, i) =>
      `http://p${i}.example.com/get.php?username=u${i}&password=p${i}`,
    ).join('\n')
    const { entries } = parseBulkText(huge)
    expect(entries.length).toBeLessThanOrEqual(1000)
  })
})

describe('keyForEntry', () => {
  it('is stable regardless of trailing slashes / case', () => {
    const a = keyForEntry({ type: 'STALKER', url: 'http://P.com/c/', macAddress: 'aa:bb:cc:dd:ee:ff', username: null })
    const b = keyForEntry({ type: 'STALKER', url: 'http://p.com/c', macAddress: 'AA:BB:CC:DD:EE:FF', username: null })
    expect(a).toBe(b)
  })
})
