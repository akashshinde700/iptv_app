import { isPublicHttpUrl, resolvedPublicUrl } from '@/lib/server/net-guard'
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
 * Host safety is delegated to `net-guard` — it checks the literal **and** the resolved
 * addresses, so a hostname that answers with a private IP (rebinding, nip.io) is blocked too.
 * (This file used to carry its own string-only copy of the check.)
 */
async function assertSafeHop(url: URL): Promise<void> {
  const blocked = !(await resolvedPublicUrl(url.href))
  if (blocked) throw new Error('blocked-host')
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
 * Fetch following redirects manually so every hop is re-checked with the DNS-aware guard
 * (a permissive upstream can otherwise 302 to a private/metadata address).
 */
async function fetchNoSSRF(
  startUrl: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeHop(current)
    const response = await fetch(current.href, { headers, redirect: 'manual', signal, cache: 'no-store' })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, current)
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('blocked-host')
      current = next
      continue
    }
    return { response, finalUrl: current }
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
  // Layer 1 (literal host) + layer 2 (what the host actually resolves to).
  if (!isPublicHttpUrl(upstreamUrl.href) || !(await resolvedPublicUrl(upstreamUrl.href))) {
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
  let finalUrl: URL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const fetched = await fetchNoSSRF(upstreamUrl, upstreamHeaders, controller.signal)
    upstream = fetched.response
    finalUrl = fetched.finalUrl
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

    // Relative segments resolve against the URL that actually served the manifest.
    const base: URL = finalUrl

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
