import { signedProxyPath, verifyProxyParams } from '@/lib/server/proxy-sign'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/* --------------------------------- Config --------------------------------- */

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const UPSTREAM_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5

/** Headers forwarded from the upstream media/segment response. */
const PASS_THROUGH_HEADERS = ['content-type', 'content-length', 'accept-ranges', 'content-range'] as const

/** Matches URI="..." attributes on HLS tags (#EXT-X-STREAM-INF, #EXT-X-KEY, ...). */
const URI_ATTR_RE = /URI="([^"]*)"/g

/* --------------------------------- Helpers -------------------------------- */

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'access-control-allow-origin': '*' } })
}

/**
 * SSRF guard based on plain string checks of the hostname (no DNS resolution):
 * localhost / *.local / *.internal, 127.x, 10.x, 192.168.x, 172.16-31.x,
 * 169.254.x, 0.0.0.0, ::1, decimal/hex IPv4 forms and a few IPv6 private forms.
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '::') return true
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) return isPrivateV4(ipv4.slice(1).map((n) => Number.parseInt(n, 10)))

  // Bare decimal (http://2130706433/) or hex (http://0x7f000001/) IPv4.
  if (/^\d{8,10}$/.test(host)) {
    const n = Number(host)
    return isPrivateV4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
  }
  if (/^0x[0-9a-f]+$/.test(host)) {
    const n = Number.parseInt(host, 16)
    return isPrivateV4([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
  }

  // IPv6 private / link-local string forms (fc00::/7, fe80::/10, v4-mapped loopback)
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8')) return true
  if (host.includes('::ffff:127.') || host.includes('::ffff:10.') || host.includes('::ffff:192.168.')) return true
  return false
}

function isPrivateV4([a, b]: number[]): boolean {
  if ([a, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
  return false
}

/** Build a signed proxy URL for an absolute upstream URL, carrying ua/ref through. */
function buildProxyUrl(absUrl: string, ua: string | null, ref: string | null): string {
  return signedProxyPath(absUrl, ua, ref)
}

/** Rewrite a single playlist line: absolutize + proxy-wrap segment URIs and URI="..." attributes. */
function rewritePlaylistLine(line: string, base: URL, ua: string | null, ref: string | null): string {
  const trimmed = line.trim()
  if (!trimmed) return line

  if (trimmed.startsWith('#')) {
    return line.replace(URI_ATTR_RE, (match, uriValue: string) => {
      const value = uriValue.trim()
      if (!value || value.startsWith('/api/proxy') || value.startsWith('data:')) return match
      try {
        const abs = new URL(value, base).href
        return `URI="${buildProxyUrl(abs, ua, ref)}"`
      } catch {
        return match
      }
    })
  }

  try {
    const abs = new URL(trimmed, base).href
    return buildProxyUrl(abs, ua, ref)
  } catch {
    return line
  }
}

/**
 * Fetch following redirects manually so every hop is re-checked against the
 * SSRF guard (a permissive upstream can otherwise 302 to a private/metadata IP).
 */
async function fetchNoSSRF(
  startUrl: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isPrivateHost(current.hostname)) throw new Error('blocked-host')
    const res = await fetch(current.href, { headers, redirect: 'manual', signal, cache: 'no-store' })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current)
      if (current.protocol !== 'http:' && current.protocol !== 'https:') throw new Error('blocked-host')
      continue
    }
    return res
  }
  throw new Error('too-many-redirects')
}

/* ----------------------------------- GET ----------------------------------- */

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)

  const verified = verifyProxyParams(searchParams)
  if (!verified) {
    return jsonError(403, 'Invalid or expired proxy URL')
  }
  const { url: rawUrl, ua, ref } = verified

  let upstreamUrl: URL
  try {
    upstreamUrl = new URL(rawUrl.trim())
  } catch {
    return jsonError(400, 'Invalid "url" parameter')
  }
  if (upstreamUrl.protocol !== 'http:' && upstreamUrl.protocol !== 'https:') {
    return jsonError(400, 'Only http(s) URLs are allowed')
  }
  if (isPrivateHost(upstreamUrl.hostname)) {
    return jsonError(400, 'Blocked host')
  }

  const upstreamHeaders: Record<string, string> = {
    'user-agent': ua && ua.trim() ? ua : DEFAULT_UA,
    accept: '*/*',
  }
  if (ref && ref.trim()) upstreamHeaders.referer = ref
  const range = request.headers.get('range')
  if (range) upstreamHeaders.range = range

  let upstream: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    upstream = await fetchNoSSRF(upstreamUrl, upstreamHeaders, controller.signal)
  } catch (error) {
    clearTimeout(timer)
    const msg = error instanceof Error ? error.message : ''
    if (msg === 'blocked-host') return jsonError(400, 'Blocked host')
    return jsonError(502, 'Upstream fetch failed')
  }
  clearTimeout(timer)

  const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase()
  const isPlaylist =
    contentType.includes('mpegurl') || upstreamUrl.pathname.toLowerCase().includes('.m3u8')

  if (isPlaylist && upstream.ok) {
    let text: string
    try {
      text = await upstream.text()
    } catch {
      return jsonError(502, 'Upstream fetch failed')
    }

    let base: URL = upstreamUrl
    if (upstream.url) {
      try {
        base = new URL(upstream.url)
      } catch {
        /* keep upstreamUrl as base */
      }
    }

    const rewritten = text
      .split(/\r?\n/)
      .map((line) => rewritePlaylistLine(line, base, ua, ref))
      .join('\n')

    return new Response(rewritten, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    })
  }

  const headers = new Headers()
  for (const name of PASS_THROUGH_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set('cache-control', 'no-store')
  headers.set('access-control-allow-origin', '*')

  return new Response(upstream.body, { status: upstream.status, headers })
}
