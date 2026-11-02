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
import { isIP } from 'node:net'
import { HttpError } from '@/lib/server/auth'

/* ------------------------------ address checks ----------------------------- */

/** True for anything that is not a globally routable unicast address. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '').trim()

  if (ip.includes(':')) return isPrivateV6(ip)

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

/**
 * Expand an IPv6 literal into its 8 16-bit groups, or null if it is not valid IPv6.
 * Handles `::` compression and a dotted IPv4 tail (`::ffff:1.2.3.4`). Node's URL parser
 * normalises `[::ffff:169.254.169.254]` to `[::ffff:a9fe:a9fe]`, so the embedded IPv4 has to be
 * recovered from the hex groups — matching on the dotted form alone is bypassable.
 */
function expandIPv6(raw: string): number[] | null {
  let ip = raw.split('%')[0] // drop a zone id (fe80::1%eth0)
  if (isIP(ip) !== 6) return null

  const dotted = ip.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number)
    ip = ip.slice(0, -dotted[0].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }

  const [head, tail] = ip.includes('::') ? ip.split('::') : [ip, undefined]
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const fill = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length
  const groups = [...headGroups, ...Array(fill).fill('0'), ...tailGroups].map((g) => Number.parseInt(g, 16))
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null
}

function v4FromGroups(hi: number, lo: number): string {
  return [hi >>> 8, hi & 255, lo >>> 8, lo & 255].join('.')
}

function isPrivateV6(address: string): boolean {
  const g = expandIPv6(address)
  if (!g) return true // unparseable: fail closed

  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0)
  if (zeroUpTo(8)) return true // ::
  if (zeroUpTo(7) && g[7] === 1) return true // ::1
  if (zeroUpTo(5) && g[5] === 0xffff) return isPrivateAddress(v4FromGroups(g[6], g[7])) // ::ffff:0:0/96 mapped
  if (zeroUpTo(6)) return isPrivateAddress(v4FromGroups(g[6], g[7])) // ::/96 IPv4-compatible
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateAddress(v4FromGroups(g[6], g[7])) // 64:ff9b::/96 NAT64
  }
  if (g[0] === 0x2002) return isPrivateAddress(v4FromGroups(g[1], g[2])) // 2002::/16 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true // 2001::/32 Teredo (embeds an obfuscated IPv4)
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true // documentation
  if (g[0] === 0x100 && zeroUpTo(4)) return true // 100::/64 discard
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 deprecated site-local
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xff00) === 0xff00) return true // multicast
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

/**
 * Drop-in `fetch` replacement for any URL an operator or upstream controls (portals, M3U, EPG,
 * probes). Same per-hop checks as `safeFetch`; returns just the final `Response`.
 */
export async function guardedFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return (await safeFetch(input, init)).response
}
