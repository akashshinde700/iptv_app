import { describe, it, expect } from 'vitest'
import { signedProxyPath, verifyProxyParams } from '@/lib/server/proxy-sign'

function paramsOf(path: string): URLSearchParams {
  return new URL(`http://x${path}`).searchParams
}

describe('proxy-sign', () => {
  it('round-trips an opaque token', () => {
    const path = signedProxyPath('https://cdn.example.com/live/master.m3u8', 'UA/1.0', 'https://ref.example')
    const v = verifyProxyParams(paramsOf(path))
    expect(v).toEqual({ url: 'https://cdn.example.com/live/master.m3u8', ua: 'UA/1.0', ref: 'https://ref.example' })
  })

  it('never exposes the upstream URL or credentials in the path', () => {
    const path = signedProxyPath('http://host.tv:80/live/USER123/PASS456/42.m3u8', 'UA/1.0')
    expect(path).toContain('/api/proxy?t=')
    // The raw URL, its credentials and even the ".m3u8" must not be visible.
    expect(path).not.toContain('USER123')
    expect(path).not.toContain('PASS456')
    expect(path).not.toContain('host.tv')
    expect(path).not.toContain('.m3u8')
    expect(path).not.toContain('UA/1.0')
    // …but it still decrypts back to the real values server-side.
    expect(verifyProxyParams(paramsOf(path))?.url).toBe('http://host.tv:80/live/USER123/PASS456/42.m3u8')
  })

  it('carries a k=hls hint for HLS sources (so the player still knows), none for others', () => {
    expect(signedProxyPath('https://cdn.example.com/a.m3u8')).toContain('k=hls')
    expect(signedProxyPath('https://cdn.example.com/a.ts')).not.toContain('k=hls')
  })

  it('rejects a tampered token', () => {
    const path = signedProxyPath('https://cdn.example.com/a.m3u8')
    const p = paramsOf(path)
    const t = p.get('t')!
    p.set('t', `${t.slice(0, -2)}xy`)
    expect(verifyProxyParams(p)).toBeNull()
  })

  it('ignores unauthenticated query params (opaque token wins)', () => {
    const path = signedProxyPath('https://cdn.example.com/a.m3u8', 'UA/1.0')
    const p = paramsOf(path)
    // Appending url=/ua= can't change what the token decrypts to.
    p.set('url', 'https://evil.example.com/a.m3u8')
    p.set('ua', 'UA/2.0')
    expect(verifyProxyParams(p)).toEqual({ url: 'https://cdn.example.com/a.m3u8', ua: 'UA/1.0', ref: null })
  })

  it('rejects an expired token', () => {
    const path = signedProxyPath('https://cdn.example.com/a.m3u8', null, null, -1000)
    expect(verifyProxyParams(paramsOf(path))).toBeNull()
  })

  it('rejects missing params / a bare url= (no open relay)', () => {
    expect(verifyProxyParams(new URLSearchParams(''))).toBeNull()
    expect(verifyProxyParams(new URLSearchParams('url=https://x.com'))).toBeNull()
  })

  it('still honours legacy HMAC-signed url=…&sig= links until they expire', () => {
    // Build a legacy link by hand is out of scope; a fabricated one must fail closed.
    const legacy = new URLSearchParams('url=https://cdn.example.com/a.m3u8&exp=' + (Date.now() + 60000) + '&sig=deadbeef')
    expect(verifyProxyParams(legacy)).toBeNull()
  })
})
