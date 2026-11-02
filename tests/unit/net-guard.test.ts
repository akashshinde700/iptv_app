import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/*
 * DNS is mocked: the guard's whole point is *what a hostname resolves to*, and the test suite
 * must never depend on real network traffic (flaky, slow, and a resolver returning a public
 * address today proves nothing about the code).
 */
const lookupMock = vi.fn()

vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}))

// net-guard imports HttpError from auth, which pulls in the Prisma client.
vi.mock('@/lib/db', () => ({ db: {} }))

import {
  __clearResolveCache,
  assertPublicSourceUrl,
  assertResolvedPublicUrl,
  isPrivateAddress,
  isPublicHttpUrl,
  resolvedPublicUrl,
  resolvesToPublicAddress,
  safeFetch,
} from '@/lib/server/net-guard'

/** Make `lookup(host, {all:true})` answer with these addresses. */
function dnsReturns(map: Record<string, string[] | 'fail'>) {
  lookupMock.mockImplementation(async (host: string) => {
    const answer = map[host]
    if (!answer || answer === 'fail') throw new Error('ENOTFOUND')
    return answer.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  })
}

beforeEach(() => {
  __clearResolveCache()
  lookupMock.mockReset()
  dnsReturns({})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isPrivateAddress', () => {
  it('flags loopback, link-local metadata and RFC1918 ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.1',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // AWS/GCP/Azure metadata service
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      'ff02::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('allows ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })

  it('decodes IPv4 embedded in IPv6 (hex-normalised mapped, compatible, NAT64, 6to4, Teredo)', () => {
    for (const ip of [
      '::ffff:a9fe:a9fe', // what new URL() turns [::ffff:169.254.169.254] into
      '::ffff:7f00:1',
      '0:0:0:0:0:ffff:7f00:0001',
      '::7f00:1', // IPv4-compatible 127.0.0.1
      '::a9fe:a9fe',
      '64:ff9b::a9fe:a9fe', // NAT64 → 169.254.169.254
      '2002:7f00:0001::1', // 6to4 → 127.0.0.1
      '2001:0:4136:e378:8000:63bf:3fff:fdd2', // Teredo
      'fe80::1%eth0',
      'fec0::1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    expect(isPrivateAddress('::ffff:808:808')).toBe(false) // 8.8.8.8
    expect(isPrivateAddress('2002:808:808::1')).toBe(false)
  })

  it('treats malformed input as private (fail closed)', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true)
    expect(isPrivateAddress('999.1.1.1')).toBe(true)
  })
})

describe('isPublicHttpUrl (layer 1)', () => {
  it('rejects localhost, .local/.internal names and private literals', () => {
    for (const url of [
      'http://localhost:3000/x',
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.1.2.3/stream.m3u8',
      'http://router.local/',
      'http://metadata.google.internal/',
      'http://2130706433/', // decimal 127.0.0.1
      'http://0x7f000001/', // hex 127.0.0.1
      'http://[::ffff:169.254.169.254]/latest/meta-data/',
      'http://[::ffff:127.0.0.1]:3000/',
      'file:///etc/passwd',
      'ftp://example.com/x',
    ]) {
      expect(isPublicHttpUrl(url), url).toBe(false)
    }
  })

  it('accepts a normal public https URL', () => {
    expect(isPublicHttpUrl('https://example.com/live/index.m3u8')).toBe(true)
    expect(isPublicHttpUrl('  https://cdn.example.net/a.m3u8  ')).toBe(true)
  })

  it('rejects empty / unparsable input', () => {
    expect(isPublicHttpUrl('')).toBe(false)
    expect(isPublicHttpUrl(null)).toBe(false)
    expect(isPublicHttpUrl('not a url')).toBe(false)
  })
})

describe('assertPublicSourceUrl', () => {
  it('throws HttpError(400) with a readable message for private hosts', () => {
    expect(() => assertPublicSourceUrl('http://192.168.0.10/list.m3u', 'Playlist URL')).toThrowError(
      /private or local address/i,
    )
    try {
      assertPublicSourceUrl('http://192.168.0.10/list.m3u', 'Playlist URL')
    } catch (error) {
      expect((error as { status?: number }).status).toBe(400)
    }
  })

  it('throws for a missing value and for a non-http scheme', () => {
    expect(() => assertPublicSourceUrl('', 'Playlist URL')).toThrowError(/required/i)
    expect(() => assertPublicSourceUrl('javascript:alert(1)', 'Playlist URL')).toThrowError(/http/i)
  })

  it('passes a public URL through', () => {
    expect(() => assertPublicSourceUrl('https://iptv.example.com/list.m3u')).not.toThrow()
  })
})

describe('resolvesToPublicAddress (layer 2)', () => {
  it('blocks a public-looking host that resolves into the private network (nip.io style)', async () => {
    dnsReturns({ '169.254.169.254.nip.io': ['169.254.169.254'] })
    expect(await resolvesToPublicAddress('169.254.169.254.nip.io')).toBe(false)
    expect(await resolvedPublicUrl('http://169.254.169.254.nip.io/latest/meta-data/')).toBe(false)
    await expect(assertResolvedPublicUrl('http://169.254.169.254.nip.io/')).rejects.toThrowError(/private or local/i)
  })

  it('blocks an internal corp name that happens to be public-looking', async () => {
    dnsReturns({ 'internal.corp.example.com': ['10.4.5.6'] })
    expect(await resolvesToPublicAddress('internal.corp.example.com')).toBe(false)
  })

  it('blocks when any single address in the answer set is private', async () => {
    dnsReturns({ 'mixed.example.com': ['93.184.216.34', '127.0.0.1'] })
    expect(await resolvesToPublicAddress('mixed.example.com')).toBe(false)
  })

  it('fails closed when DNS does not resolve', async () => {
    expect(await resolvesToPublicAddress('does-not-exist.example.com')).toBe(false)
  })

  it('allows a host that resolves only to public addresses', async () => {
    dnsReturns({ 'cdn.example.com': ['93.184.216.34', '2606:2800:220:1::1'] })
    expect(await resolvesToPublicAddress('cdn.example.com')).toBe(true)
    expect(await resolvedPublicUrl('https://cdn.example.com/live/index.m3u8')).toBe(true)
  })

  it('handles literal IPs without a DNS lookup', async () => {
    expect(await resolvesToPublicAddress('127.0.0.1')).toBe(false)
    expect(await resolvesToPublicAddress('93.184.216.34')).toBe(true)
    expect(lookupMock).not.toHaveBeenCalled()
  })

  it('caches answers for the host', async () => {
    dnsReturns({ 'cdn.example.com': ['93.184.216.34'] })
    await resolvesToPublicAddress('cdn.example.com')
    await resolvesToPublicAddress('cdn.example.com')
    expect(lookupMock).toHaveBeenCalledTimes(1)
  })
})

describe('safeFetch', () => {
  it('refuses the first hop when it resolves privately', async () => {
    dnsReturns({ 'evil.example.com': ['169.254.169.254'] })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(safeFetch('http://evil.example.com/')).rejects.toThrowError(/blocked host/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('re-checks every redirect hop and stops before fetching a private target', async () => {
    dnsReturns({ 'public.example.com': ['93.184.216.34'], 'private.example.com': ['10.0.0.5'] })
    const fetchSpy = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://private.example.com/secret' } }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    await expect(safeFetch('https://public.example.com/')).rejects.toThrowError(/blocked host/i)
    // Only the public hop was fetched; the private target never was.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect((fetchSpy.mock.calls[0] as unknown[])[0]).toBe('https://public.example.com/')
  })

  it('follows a public redirect and returns the final URL', async () => {
    dnsReturns({ 'a.example.com': ['93.184.216.34'], 'b.example.com': ['93.184.216.35'] })
    const fetchSpy = vi.fn(async (url: string) =>
      url.includes('a.example.com')
        ? new Response(null, { status: 301, headers: { location: 'https://b.example.com/final.m3u8' } })
        : new Response('#EXTM3U', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { response, url } = await safeFetch('https://a.example.com/start')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)
    // Relative segment URIs must resolve against the URL that actually served the manifest.
    expect(url.href).toBe('https://b.example.com/final.m3u8')
  })

  it('gives up after the redirect budget instead of looping forever', async () => {
    dnsReturns({ 'loop.example.com': ['93.184.216.34'] })
    const fetchSpy = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'https://loop.example.com/again' } }),
    )
    vi.stubGlobal('fetch', fetchSpy)
    await expect(safeFetch('https://loop.example.com/', { maxRedirects: 2 })).rejects.toThrowError(/too many redirects/i)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})
