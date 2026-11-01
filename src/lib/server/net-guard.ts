/**
 * SSRF guard for admin-supplied source URLs (portals / M3U links).
 *
 * Same rules as the media proxy: only http/https to a public host. Blocks
 * localhost, private/link-local/CGNAT ranges, cloud-metadata IPs and decimal/hex
 * IPv4 forms — so a platform admin can't point a "source" at an internal service.
 * String-based (no DNS): a determined attacker with DNS control is out of scope
 * here; this stops the obvious mistakes and the common metadata-endpoint pull.
 */
import { HttpError } from '@/lib/server/auth'

function isPrivateV4([a, b]: number[]): boolean {
  if ([a, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local + AWS/GCP metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '::') return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) return isPrivateV4(ipv4.slice(1).map((n) => Number.parseInt(n, 10)))
  if (/^\d{8,10}$/.test(host)) {
    const n = Number(host)
    return isPrivateV4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
  }
  if (/^0x[0-9a-f]+$/.test(host)) {
    const n = Number.parseInt(host, 16)
    return isPrivateV4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
  }
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8')) return true
  if (host.includes('::ffff:127.') || host.includes('::ffff:10.') || host.includes('::ffff:192.168.')) return true
  return false
}

/** Throw HttpError(400) unless `raw` is an http(s) URL to a public host. */
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
  if (isPrivateHost(url.hostname)) {
    throw new HttpError(400, `${label} points to a private or local address, which isn't allowed`)
  }
}
