/**
 * Last-resort embed players.
 *
 * When every scraper fails for a title (new release, region block, scraper outage) the reference
 * site does not show a dead end — it swaps in one of several third-party iframe players keyed by
 * TMDB id. Same idea here: a viewer who reached "Play" should get *something* playable, and the
 * embed is clearly labelled so nobody thinks it is our stream.
 *
 * Security notes (this is the only place in the product that renders a third-party document):
 *   - the URL is built from a **numeric TMDB id only** — never from user text — so no query or
 *     path injection is possible;
 *   - the iframe is sandboxed without `allow-top-navigation` (see MediaTitleView), so an embed
 *     cannot navigate the app or open pop-unders;
 *   - `referrerPolicy="no-referrer"` keeps the storefront URL out of the third party's logs;
 *   - it is behind the same opt-in provider flag as everything else in this folder.
 */
import type { MediaSource } from './types'

export interface EmbedPlayer {
  id: string
  name: string
  /** builds the player URL for this title/episode */
  build(tmdbId: number, kind: 'movie' | 'tv', season: number, episode: number): string
}

const AUTOPLAY = 'autoplay=true'

export const EMBED_PLAYERS: readonly EmbedPlayer[] = [
  {
    id: 'embed-vidfast',
    name: 'VidFast',
    build: (tmdbId, kind, season, episode) =>
      kind === 'movie'
        ? `https://vidfast.pro/movie/${tmdbId}?${AUTOPLAY}`
        : `https://vidfast.pro/tv/${tmdbId}/${season}/${episode}?${AUTOPLAY}`,
  },
  {
    id: 'embed-videasy',
    name: 'VidEasy',
    build: (tmdbId, kind, season, episode) =>
      kind === 'movie'
        ? `https://player.videasy.net/movie/${tmdbId}?${AUTOPLAY}`
        : `https://player.videasy.net/tv/${tmdbId}/${season}/${episode}?${AUTOPLAY}`,
  },
  {
    id: 'embed-vidnest',
    name: 'VidNest',
    build: (tmdbId, kind, season, episode) =>
      kind === 'movie'
        ? `https://vidnest.fun/movie/${tmdbId}?${AUTOPLAY}`
        : `https://vidnest.fun/tv/${tmdbId}/${season}/${episode}?${AUTOPLAY}`,
  },
  {
    id: 'embed-moviesapi',
    name: 'MoviesAPI',
    build: (tmdbId, kind, season, episode) =>
      kind === 'movie'
        ? `https://w1.moviesapi.to/movie/${tmdbId}?${AUTOPLAY}`
        : `https://w1.moviesapi.to/tv/${tmdbId}/${season}/${episode}?${AUTOPLAY}`,
  },
  {
    id: 'embed-screenscape',
    name: 'ScreenScape',
    build: (tmdbId, kind, season, episode) =>
      `https://web.screenscape.fun/embed?tmdb=${tmdbId}&type=${kind}&s=${season}&e=${episode}&${AUTOPLAY}`,
  },
  {
    id: 'embed-vidzee',
    name: 'VidZee',
    build: (tmdbId, kind, season, episode) =>
      kind === 'movie'
        ? `https://player.vidzee.wtf/embed/movie/${tmdbId}?${AUTOPLAY}`
        : `https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}?${AUTOPLAY}`,
  },
] as const

/**
 * Embed sources for a title. `url` is the absolute player URL (not a proxy path): an iframe needs
 * a real document URL, which is exactly why `MediaSource.embed` is a separate flag rather than a
 * `type`, so nothing in the player pipeline ever tries to hand it to hls.js.
 */
export function embedFallbacks(
  tmdbId: number,
  kind: 'movie' | 'tv',
  season = 1,
  episode = 1,
): MediaSource[] {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return []
  return EMBED_PLAYERS.map((player) => ({
    id: `${player.id}-${tmdbId}-${kind === 'tv' ? `s${season}e${episode}` : 'movie'}`,
    server: player.name,
    label: 'Embed',
    quality: null,
    type: 'file' as const,
    url: player.build(tmdbId, kind, Math.max(1, season), Math.max(1, episode)),
    subtitles: [],
    embed: true,
  }))
}

/** Only https URLs from the allow-list may ever reach an iframe. */
export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return EMBED_PLAYERS.some((player) => {
      const host = new URL(player.build(1, 'movie', 1, 1)).hostname
      return parsed.hostname === host || parsed.hostname.endsWith(`.${host.replace(/^www\./, '')}`)
    })
  } catch {
    return false
  }
}
