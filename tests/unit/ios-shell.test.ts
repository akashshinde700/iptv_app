import { afterEach, describe, expect, it, vi } from 'vitest'
import { getIosShell, haptic, isIosShell, shareLink, type StreamKaroIosShell } from '@/lib/ios-shell'
import { GET as associationGET } from '@/app/apple-app-site-association/route'

type FakeWindow = {
  StreamKaroNative?: Partial<StreamKaroIosShell>
  navigator?: { share?: unknown; clipboard?: { writeText: (text: string) => Promise<void> } }
}

function fakeWindow(init: FakeWindow = {}) {
  const win = init as unknown as Window & typeof globalThis
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true })
  return win
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('iOS shell detection', () => {
  it('is off in a plain browser', () => {
    fakeWindow()
    expect(getIosShell()).toBeNull()
    expect(isIosShell()).toBe(false)
  })

  it('is off during server rendering (no window at all)', () => {
    expect(getIosShell()).toBeNull()
  })

  it('ignores a shell object that is not the iOS one', () => {
    fakeWindow({ StreamKaroNative: { platform: 'android' as unknown as 'ios' } })
    expect(getIosShell()).toBeNull()
  })

  it('returns the injected shell when the iOS app is running', () => {
    const shell = { platform: 'ios' as const, version: 1 }
    fakeWindow({ StreamKaroNative: shell })
    expect(getIosShell()).toBe(shell)
    expect(isIosShell()).toBe(true)
  })
})

describe('shareLink', () => {
  it('uses the native share sheet inside the iOS app', async () => {
    const share = vi.fn()
    const tap = vi.fn()
    fakeWindow({ StreamKaroNative: { platform: 'ios', version: 1, share, haptic: tap } })

    await expect(shareLink({ url: 'https://x.test/p.m3u', title: 'My playlist' })).resolves.toBe('native')
    expect(share).toHaveBeenCalledWith({ url: 'https://x.test/p.m3u', title: 'My playlist' })
    expect(tap).toHaveBeenCalledWith('light')
  })

  it('falls back to the Web Share API in a browser', async () => {
    fakeWindow()
    const webShare = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      value: { share: webShare },
      configurable: true,
      writable: true,
    })

    await expect(shareLink({ url: 'https://x.test/p.m3u' })).resolves.toBe('web')
    expect(webShare).toHaveBeenCalledWith({ url: 'https://x.test/p.m3u' })
    Reflect.deleteProperty(globalThis, 'navigator')
  })

  it('copies the link when sharing is unavailable', async () => {
    fakeWindow()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText } },
      configurable: true,
      writable: true,
    })

    await expect(shareLink({ url: 'https://x.test/p.m3u' })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://x.test/p.m3u')
    Reflect.deleteProperty(globalThis, 'navigator')
  })

  it('never throws when everything is blocked', async () => {
    fakeWindow()
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: vi.fn().mockRejectedValue(new Error('denied')),
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      },
      configurable: true,
      writable: true,
    })

    await expect(shareLink({ url: 'https://x.test/p.m3u' })).resolves.toBe('failed')
    Reflect.deleteProperty(globalThis, 'navigator')
  })

  it('haptic is a no-op outside the app', () => {
    fakeWindow()
    expect(() => haptic('success')).not.toThrow()
  })
})

describe('universal link association file', () => {
  it('404s until APPLE_TEAM_ID is configured', async () => {
    vi.stubEnv('APPLE_TEAM_ID', '')
    const response = await associationGET()
    expect(response.status).toBe(404)
  })

  it('publishes the app id and routes when configured', async () => {
    vi.stubEnv('APPLE_TEAM_ID', 'ABCDE12345')
    vi.stubEnv('APPLE_BUNDLE_ID', '')
    const response = await associationGET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    const detail = body.applinks.details[0]
    expect(detail.appIDs).toEqual(['ABCDE12345.com.streamkaro.app'])
    // /api/* and /downloads/* must not be swallowed by the app.
    const excluded = detail.components.filter((c: { exclude?: boolean }) => c.exclude).map((c: { '/': string }) => c['/'])
    expect(excluded).toEqual(['/api/*', '/downloads/*'])
    expect(detail.components.some((c: { '/': string }) => c['/'] === '/watch/*')).toBe(true)
  })

  it('honours a custom bundle id', async () => {
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456')
    vi.stubEnv('APPLE_BUNDLE_ID', 'in.example.streamkaro')
    const body = await (await associationGET()).json()
    expect(body.applinks.details[0].appIDs).toEqual(['TEAM123456.in.example.streamkaro'])
  })
})
