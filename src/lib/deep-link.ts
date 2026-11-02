/**
 * URL <-> screen mapping.
 *
 * The app keeps navigation in a client-side stack (`useAppStore.stack`), which used to mean the
 * URL never changed. That broke four things at once:
 *
 *   - refreshing the page threw you back to Home,
 *   - a bookmark or a shared link could not open a channel,
 *   - the iOS shell's `streamkaro://watch/<id>` and its universal links landed on a 404,
 *   - the `/signup` success screen linked to `/admin`, which did not exist.
 *
 * This module is the single translation table. It is deliberately pure (no window, no store), so
 * both the server route and the client shell can use it and it can be unit-tested.
 *
 * No ids are validated here beyond "non-empty": an unknown id must still reach the app so it can
 * show a proper "channel not found" state instead of a blank 404 page.
 */
import type { View } from '@/lib/store'

/** Paths that render a screen (as opposed to assets / API routes). */
export const APP_ROUTES = [
  '/',
  '/live',
  '/movies',
  '/search',
  '/favorites',
  '/history',
  '/premium',
  '/profile',
  '/account',
  '/settings',
  '/admin',
  '/download',
  '/guide',
] as const

/**
 * Map a browser path to the screen it represents.
 * Returns `null` for anything that is not an app screen (the caller then shows a real 404).
 */
export function viewFromPath(pathname: string, search = ''): View | null {
  const clean = normalisePath(pathname)
  const parts = clean.split('/').filter(Boolean)
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  // Explicit ?view=<name> wins (used by in-app links and by the old #admin hash migration).
  const explicit = params.get('view')
  if (explicit) {
    const fromParam = viewFromName(explicit, params)
    // An explicit but unknown screen is a broken link — say so (404) rather than pretending the
    // visitor asked for Home.
    if (fromParam) return fromParam
    return null
  }

  if (parts.length === 0) return { name: 'home' }

  const [first, second] = parts
  switch (first) {
    case 'live':
      return { name: 'browse' }
    case 'movies':
      return second ? { name: 'title', id: decodeURIComponent(second) } : { name: 'movies' }
    case 'movie':
      return second ? { name: 'movie', movieId: decodeURIComponent(second) } : { name: 'movies' }
    case 'watch':
      return second ? { name: 'watch', channelId: decodeURIComponent(second) } : { name: 'browse' }
    case 'search':
      return { name: 'search' }
    case 'favorites':
      return { name: 'favorites' }
    case 'history':
      return { name: 'history' }
    case 'premium':
    case 'plans':
      return { name: 'premium' }
    case 'profile':
    case 'account':
      return { name: 'account' }
    case 'settings':
      return { name: 'settings' }
    case 'admin':
    case 'panel':
      // `/admin/<section>` addresses a panel section; the panel picks the section from the path.
      return { name: 'admin' }
    case 'download':
    case 'downloads':
      return { name: 'download' }
    case 'guide':
      return { name: 'browse' }
    // Depth-2 convenience aliases (`/live/<id>` opens the player).
    case 'channel':
      return second ? { name: 'watch', channelId: decodeURIComponent(second) } : { name: 'browse' }
    case 'title':
      return second ? { name: 'title', id: decodeURIComponent(second) } : { name: 'movies' }
    default:
      // Anything else is not an app screen: this is a genuine 404.
      return null
  }
}

function viewFromName(name: string, params: URLSearchParams): View | null {
  switch (name) {
    case 'home':
      return { name: 'home' }
    case 'browse':
    case 'live':
      return { name: 'browse' }
    case 'movies':
      return { name: 'movies' }
    case 'search':
      return { name: 'search' }
    case 'favorites':
      return { name: 'favorites' }
    case 'history':
      return { name: 'history' }
    case 'premium':
      return { name: 'premium' }
    case 'account':
    case 'profile':
      return { name: 'account' }
    case 'settings':
      return { name: 'settings' }
    case 'admin':
      return { name: 'admin' }
    case 'download':
      return { name: 'download' }
    case 'watch': {
      const id = params.get('id') ?? params.get('channel')
      return id ? { name: 'watch', channelId: id } : { name: 'browse' }
    }
    case 'title': {
      const id = params.get('id')
      return id ? { name: 'title', id } : { name: 'movies' }
    }
    case 'movie': {
      const id = params.get('id')
      return id ? { name: 'movie', movieId: id } : { name: 'movies' }
    }
    default:
      return null
  }
}

/** The canonical browser path for a screen (used to keep the address bar in sync). */
export function pathForView(view: View): string {
  switch (view.name) {
    case 'home':
      return '/'
    case 'browse':
      return '/live'
    case 'movies':
      return '/movies'
    case 'title':
      return `/movies/${encodeURIComponent(view.id)}`
    case 'movie':
      return `/movie/${encodeURIComponent(view.movieId)}`
    case 'watch':
      return `/watch/${encodeURIComponent(view.channelId)}`
    case 'search':
      return '/search'
    case 'favorites':
      return '/favorites'
    case 'history':
      return '/history'
    case 'premium':
      return '/premium'
    case 'account':
      return '/profile'
    case 'settings':
      return '/settings'
    case 'admin':
      return '/admin'
    case 'download':
      return '/download'
    default:
      return '/'
  }
}

/** True when this path is one the app itself renders (vs. an asset or an API call). */
export function isAppPath(pathname: string): boolean {
  return viewFromPath(pathname) !== null
}

function normalisePath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0].split('#')[0]
  // A trailing slash is the same screen; decoding is per-segment above.
  return withoutQuery.replace(/\/+$/, '') || '/'
}
