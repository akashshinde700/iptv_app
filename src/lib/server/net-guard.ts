/**
 * SSRF guard for operator-supplied source URLs (portals / M3U links / manual streams) and for
 * the public media proxy.
 *
 * Two layers, because either one alone is bypassable:
 *
 *   1. **Syntactic** (`isPublicHttpUrl` / `assertPublicSourceUrl`, synchronous): only http(s),
 *      and the hostname must not *look* private — localhost, *.local/*.internal, 127/8, 10/8,
 *      192.168/16, 172.16/12, 169.254/16 (cloud metadata), 100.64/10 (CGNAT), decimal/hex IPv4
 *      and a few IPv6 private forms.
 *   2. **Resolved** (`resolvesToPublicAddress` / `assertResolvedPublicUrl`, async): DNS is
 *      actually looked up and every returned address is re-checked. This closes the hole the
 *      first layer cannot see: `169.254.169.254.nip.io`, `internal.corp.example.com`, or an
 *      attacker domain that answers public-then-private (DNS rebinding).
 *
 * Layer 2 costs a lookup per host, so results are cached for a minute — the media proxy is a
 * hot path and segment requests repeat the same handful of hosts.
 */
import { lookup } from 'node:dns/promises'
import { HttpError } from '@/lib/server/auth'

/* ------------------------------ address checks ----------------------------- */

/** True for anything that is not a globally routable unicast address. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '').trim()

  if (ip.includes(':')) {
    // IPv6
    if (ip === '::' || ip === '::1') return true
    if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) return true // fe80::/10
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true // unique local fc00::/7
    if (ip.startsWith('ff')) return true // multicast
    const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return isPrivateAddress(mapped[1])
    return false
  }

  const parts = ip.split('.')
  if (parts.length !== 4) return true
  const octets = parts.map((part) => Number(part))
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  return isPrivateV4(octets)
}

function isPrivateV4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local + AWS/GCP/Azure metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 192 && b === 0) return true // 192.0.0.0/24, 192.0.2.0/24
  if (a >= 224) return true // multicast / reserved
  return false
}

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '::') return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host.endsWith('.localdomain') || host === 'metadata.google.internal') return true

  // Bare decimal (http://2130706433/) or hex (http://0x7f000001/) IPv4.
  if (/^\d{8,10}$/.test(host)) {
    const n = Number(host)
    return isPrivateAddress([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'))
  }
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = Number.parseInt(host, 16)
    if (!Number.isFinite(n)) return true
    return isPrivateAddress([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'))
  }

  // Anything that parses as an IP literal must pass the address check.
  if (/^[\d.]+$/.test(host) || host.includes(':')) return isPrivateAddress(host)

  return false
}

/* ------------------------------ layer 1: sync ----------------------------- */

/** Non-throwing syntactic check, for the health doctor's probes. */
export function isPublicHttpUrl(raw: string | null | undefined): boolean {
  const value = raw?.trim()
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return !isPrivateHostname(url.hostname)
  } catch {
    return false
  }
}

/** Throw HttpError(400) unless `raw` is an http(s) URL to a syntactically public host. */
export function assertPublicSourceUrl(raw: string | null | undefined, label = 'URL'): void {
  const value = raw?.trim()
  if (!value) throw new HttpError(400, `${label} is required`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HttpError(400, `${label} is not a valid URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, `${label} must start with http:// or https://`)
  }
  if (isPrivateHostname(url.hostname)) {
    throw new HttpError(400, `${label} points to a private or local address, which isn't allowed`)
  }
}

/* ----------------------------- layer 2: async ----------------------------- */

const HOST_TTL_MS = 60_000
const MAX_CACHE_ENTRIES = 500
const resolveCache = new Map<string, { public: boolean; expiresAt: number }>()

/**
 * Does this hostname resolve *only* to public addresses?
 * Unknown hosts (DNS failure) are treated as not-public: a URL that cannot be resolved cannot be
 * fetched usefully anyway, and failing closed is the safe direction for a guard.
 */
export async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return false

  const cached = resolveCache.get(host)
  if (cached && cached.expiresAt > Date.now()) return cached.public

  let isPublic: boolean
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    isPublic = !isPrivateAddress(host)
  } else {
    try {
      const addresses = await lookup(host, { all: true, verbatim: true })
      isPublic = addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address))
    } catch {
      isPublic = false
    }
  }

  if (resolveCache.size > MAX_CACHE_ENTRIES) resolveCache.clear()
  resolveCache.set(host, { public: isPublic, expiresAt: Date.now() + HOST_TTL_MS })
  return isPublic
}

/**
 * Convenience boolean for hot paths: true only when the URL is http(s), its host looks public
 * *and* the resolved addresses are public. Never throws.
 */
export async function resolvedPublicUrl(raw: string | URL | null | undefined): Promise<boolean> {
  const value = typeof raw === 'object' && raw ? raw.href : raw?.trim()
  if (!isPublicHttpUrl(value)) return false
  try {
    const host = new URL(value!).hostname
    return await resolvesToPublicAddress(host)
  } catch {
    return false
  }
}

/** Layer 1 + layer 2. Throws HttpError(400) when the URL is not safe to fetch. */
export async function assertResolvedPublicUrl(raw: string | null | undefined, label = 'URL'): Promise<URL> {
  assertPublicSourceUrl(raw, label)
  const url = new URL(raw!.trim())
  if (!(await resolvesToPublicAddress(url.hostname))) {
    throw new HttpError(400, `${label} resolves to a private or local address, which isn't allowed`)
  }
  return url
}

/** Test helper: forget cached lookups (used by the unit tests). */
export function __clearResolveCache(): void {
  resolveCache.clear()
}

/* ------------------------------- safe fetch ------------------------------- */

const MAX_REDIRECTS = 5

/**
 * `fetch` for operator/upstream URLs: every hop (including redirect targets) is checked with
 * both layers before it is fetched, so a permissive upstream cannot bounce us into a private
 * address. Returns the final `Response` plus the final URL (needed to resolve relative HLS URIs).
 */
export async function safeFetch(
  input: string | URL,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<{ response: Response; url: URL }> {
  let current = typeof input === 'string' ? new URL(input) : input
  const maxRedirects = init.maxRedirects ?? MAX_REDIRECTS
  const { maxRedirects: _ignored, ...rest } = init

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new HttpError(400, 'Only http(s) URLs are allowed')
    }
    if (!(await resolvesToPublicAddress(current.hostname))) {
      throw new HttpError(400, 'Blocked host')
    }

    const response = await fetch(current.href, { ...rest, redirect: 'manual' })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current)
      continue
    }
    return { response, url: current }
  }

  throw new HttpError(400, 'Too many redirects')
}
