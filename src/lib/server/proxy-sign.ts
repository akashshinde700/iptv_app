/**
 * Opaque, tamper-proof tokens for /api/proxy.
 *
 * The proxy used to accept ANY `url` param — an open relay. It was then locked down with
 * an HMAC signature over (url, ua, ref, exp), but the raw upstream URL still travelled in
 * the query string — and for Xtream sources that URL embeds the account username/password,
 * so a customer could read the source credentials straight out of their network tab.
 *
 * Now the whole payload is AES-256-GCM **encrypted** into one opaque `t` token: the client
 * (customer or operator) only ever sees `/api/proxy?t=<ciphertext>`, never the upstream URL
 * or its credentials. GCM's auth tag also makes the token unforgeable, so it doubles as the
 * anti-open-relay guard. A short, non-sensitive `k=hls` hint rides alongside so the player
 * still knows to use HLS (the real URL is no longer visible to sniff for ".m3u8").
 *
 * Old HMAC-signed `url=…&sig=…` links are still accepted so sessions already in flight keep
 * working; they carry no new links and expire within the TTL.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.PROXY_SIGNING_SECRET ?? ''
if (!SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('PROXY_SIGNING_SECRET is not set')
}

/** How long a minted proxy URL stays valid (covers a long live-TV session). */
const TTL_MS = 24 * 60 * 60 * 1000

/** 32-byte AES key derived from the proxy secret (no extra env var needed). */
function aesKey(): Buffer {
  return createHash('sha256').update(SECRET || 'dev-insecure-secret').digest()
}

function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', aesKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // token = base64url( iv(12) | tag(16) | ciphertext )
  return Buffer.concat([iv, tag, ct]).toString('base64url')
}

function decryptToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 28) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ct = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', aesKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Build an opaque, same-origin proxy path for an absolute upstream media URL. */
export function signedProxyPath(
  rawUrl: string,
  ua?: string | null,
  ref?: string | null,
  ttlMs: number = TTL_MS,
): string {
  const exp = Date.now() + ttlMs
  const u = ua && ua.trim() ? ua.trim() : null
  const r = ref && ref.trim() ? ref.trim() : null
  // Compact payload: u=url, a=ua, r=ref, e=exp
  const token = encryptToken(JSON.stringify({ u: rawUrl, a: u, r, e: exp }))
  // Non-sensitive player hint (the real URL is encrypted, so the client can't sniff ".m3u8").
  const hls = /m3u8/i.test(rawUrl) ? '&k=hls' : ''
  return `/api/proxy?t=${token}${hls}`
}

export interface VerifiedProxyParams {
  url: string
  ua: string | null
  ref: string | null
}

/* ------------------------- backward-compat (old links) ------------------------ */

function sign(payload: string): string {
  return createHmac('sha256', SECRET || 'dev-insecure-secret').update(payload).digest('base64url')
}
function payloadOf(url: string, ua: string | null, ref: string | null, exp: number): string {
  return `${url}\n${ua ?? ''}\n${ref ?? ''}\n${exp}`
}

/** Validate an incoming /api/proxy request. Returns null when invalid/expired. */
export function verifyProxyParams(searchParams: URLSearchParams): VerifiedProxyParams | null {
  // New opaque encrypted token.
  const t = searchParams.get('t')
  if (t) {
    const decrypted = decryptToken(t)
    if (!decrypted) return null
    try {
      const p = JSON.parse(decrypted) as { u?: string; a?: string | null; r?: string | null; e?: number }
      if (!p.u || typeof p.e !== 'number' || p.e < Date.now()) return null
      return { url: p.u, ua: p.a || null, ref: p.r || null }
    } catch {
      return null
    }
  }

  // Legacy HMAC-signed URLs (still honoured until they expire; no new ones are minted).
  const url = searchParams.get('url')
  const ua = searchParams.get('ua')
  const ref = searchParams.get('ref')
  const expRaw = searchParams.get('exp')
  const sig = searchParams.get('sig')
  if (!url || !expRaw || !sig) return null

  const exp = Number.parseInt(expRaw, 10)
  if (!Number.isFinite(exp) || exp < Date.now()) return null

  const expected = sign(payloadOf(url, ua, ref, exp))
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return { url, ua: ua || null, ref: ref || null }
}
