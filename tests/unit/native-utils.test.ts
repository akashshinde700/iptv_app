import { describe, it, expect } from 'vitest'
import { apkUrlFor, guessStreamMimeType, shouldOfferUpdate } from '@/lib/native-utils'

describe('shouldOfferUpdate', () => {
  it('offers a strictly newer versionCode', () => {
    expect(shouldOfferUpdate(2, 3, null)).toBe(true)
  })

  it('ignores same or older builds', () => {
    expect(shouldOfferUpdate(3, 3, null)).toBe(false)
    expect(shouldOfferUpdate(4, 3, null)).toBe(false)
  })

  it('respects a dismissal of that exact version only', () => {
    expect(shouldOfferUpdate(2, 3, 3)).toBe(false)
    expect(shouldOfferUpdate(2, 4, 3)).toBe(true)
  })

  it('rejects garbage input', () => {
    expect(shouldOfferUpdate(Number.NaN, 3, null)).toBe(false)
  })
})

describe('apkUrlFor', () => {
  const release = { version: '0.4.0', versionCode: 3, notes: [], mobile: '/m.apk', tv: '/tv.apk' }

  it('picks the APK matching the installed flavor', () => {
    expect(apkUrlFor(release, 'tv')).toBe('/tv.apk')
    expect(apkUrlFor(release, 'mobile')).toBe('/m.apk')
  })
})

describe('guessStreamMimeType', () => {
  const proxied = (u: string) => `/api/proxy?url=${encodeURIComponent(u)}&exp=1&sig=x`

  it('detects HLS behind the proxy', () => {
    expect(guessStreamMimeType(proxied('http://a.tv/live/1/index.m3u8?token=1'))).toBe('application/x-mpegURL')
  })

  it('detects DASH behind the proxy', () => {
    expect(guessStreamMimeType(proxied('https://a.tv/manifest.mpd'))).toBe('application/dash+xml')
  })

  it('leaves raw TS / progressive streams to ExoPlayer sniffing', () => {
    expect(guessStreamMimeType(proxied('http://a.tv/live/user/pass/123.ts'))).toBeUndefined()
  })

  it('works on unproxied URLs too', () => {
    expect(guessStreamMimeType('https://a.tv/x/playlist.m3u8')).toBe('application/x-mpegURL')
  })
})
