import { describe, it, expect } from 'vitest'
import { isAppPath, pathForView, viewFromPath } from '@/lib/deep-link'
import type { View } from '@/lib/store'

/*
 * Deep links used to be dead: every screen except Home was a 404 on reload, so bookmarks, shared
 * links, the signup → /admin link and the iOS shell's streamkaro:// URLs all broke. These tests
 * pin the path ⇄ screen contract in both directions.
 */

describe('viewFromPath', () => {
  it('maps the plain screens', () => {
    expect(viewFromPath('/')).toEqual({ name: 'home' })
    expect(viewFromPath('/live')).toEqual({ name: 'browse' })
    expect(viewFromPath('/movies')).toEqual({ name: 'movies' })
    expect(viewFromPath('/search')).toEqual({ name: 'search' })
    expect(viewFromPath('/favorites')).toEqual({ name: 'favorites' })
    expect(viewFromPath('/history')).toEqual({ name: 'history' })
    expect(viewFromPath('/premium')).toEqual({ name: 'premium' })
    expect(viewFromPath('/profile')).toEqual({ name: 'account' })
    expect(viewFromPath('/settings')).toEqual({ name: 'settings' })
    expect(viewFromPath('/admin')).toEqual({ name: 'admin' })
    expect(viewFromPath('/download')).toEqual({ name: 'download' })
  })

  it('maps detail screens with their ids', () => {
    expect(viewFromPath('/watch/ch_123')).toEqual({ name: 'watch', channelId: 'ch_123' })
    expect(viewFromPath('/movies/mv_9')).toEqual({ name: 'title', id: 'mv_9' })
    expect(viewFromPath('/movie/mv_9')).toEqual({ name: 'movie', movieId: 'mv_9' })
  })

  it('decodes percent-encoded ids', () => {
    expect(viewFromPath('/watch/star%20plus')).toEqual({ name: 'watch', channelId: 'star plus' })
  })

  it('ignores a trailing slash and the query string on the path', () => {
    expect(viewFromPath('/live/')).toEqual({ name: 'browse' })
    expect(viewFromPath('/movies?x=1')).toEqual({ name: 'movies' })
  })

  it('accepts the explicit ?view= form used by in-app links', () => {
    expect(viewFromPath('/anything', 'view=watch&id=ch_1')).toEqual({ name: 'watch', channelId: 'ch_1' })
    expect(viewFromPath('/', 'view=admin')).toEqual({ name: 'admin' })
    expect(viewFromPath('/', 'view=nonsense')).toBeNull()
  })

  it('returns null for paths that are not screens (real 404)', () => {
    for (const path of ['/nope', '/api/channels', '/wp-login.php', '/manifest.webmanifest']) {
      expect(viewFromPath(path), path).toBeNull()
    }
  })

  it('treats any /admin sub-path as the admin screen (the panel picks the section)', () => {
    expect(viewFromPath('/admin/customers')).toEqual({ name: 'admin' })
    expect(viewFromPath('/admin/customers/42')).toEqual({ name: 'admin' })
  })

  it('does not treat a bare detail path with no id as a screen', () => {
    // `/watch` alone is not a player — it falls back to the browse screen rather than 404.
    expect(viewFromPath('/watch')).toEqual({ name: 'browse' })
  })
})

describe('pathForView', () => {
  it('is the inverse of viewFromPath for every screen', () => {
    const views: View[] = [
      { name: 'home' },
      { name: 'browse' },
      { name: 'movies' },
      { name: 'search' },
      { name: 'favorites' },
      { name: 'history' },
      { name: 'premium' },
      { name: 'account' },
      { name: 'settings' },
      { name: 'admin' },
      { name: 'download' },
      { name: 'watch', channelId: 'ch_1' },
      { name: 'title', id: 'mv_1' },
      { name: 'movie', movieId: 'mv_1' },
    ]
    for (const view of views) {
      expect(viewFromPath(pathForView(view)), JSON.stringify(view)).toEqual(view)
    }
  })

  it('encodes ids safely', () => {
    expect(pathForView({ name: 'watch', channelId: 'a/b' })).toBe('/watch/a%2Fb')
  })
})

describe('isAppPath', () => {
  it('separates screens from assets and API routes', () => {
    expect(isAppPath('/live')).toBe(true)
    expect(isAppPath('/manifest.webmanifest')).toBe(false)
    expect(isAppPath('/api/proxy')).toBe(false)
  })
})
