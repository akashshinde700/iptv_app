import { clientIp, rateLimit, toErrorResponse } from '@/lib/server/auth'
import { absolutize, buildPlaylist, verifyPlaylistToken } from '@/lib/server/playlist'

export const dynamic = 'force-dynamic'

/**
 * Public playlist endpoint — the token in the path IS the credential (HMAC-signed, no portal
 * secrets inside). Works from VLC / TiviMate / Kodi on any device, no cookie needed.
 *
 *   GET /api/playlist/<token>/streamkaro.m3u
 *
 * A catch-all is used because players like to append a filename themselves.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  try {
    const { slug } = await params
    // first segment is the token; anything after it (streamkaro.m3u, playlist.m3u, …) is ignored
    const token = (slug?.[0] ?? '').replace(/\.m3u8?$/i, '')

    const m3u = (body: string, status = 200) =>
      new Response(body, {
        status,
        headers: {
          'content-type': 'audio/x-mpegurl; charset=utf-8',
          'content-disposition': 'inline; filename="streamkaro.m3u"',
          'cache-control': status === 200 ? 'private, max-age=60' : 'no-store',
        },
      })

    if (!rateLimit(`playlist:${clientIp(request)}`, 30, 60_000)) {
      return m3u('#EXTM3U\n# too many requests — retry in a minute\n', 429)
    }

    const customerId = verifyPlaylistToken(token)
    if (!customerId) return m3u('#EXTM3U\n# invalid or expired playlist link\n', 404)

    const built = await buildPlaylist(customerId)
    if (!built) return m3u('#EXTM3U\n# playlist not available\n', 404)

    const origin = new URL(request.url).origin
    return new Response(absolutize(built.content, origin), {
      headers: {
        'content-type': 'audio/x-mpegurl; charset=utf-8',
        'content-disposition': 'inline; filename="streamkaro.m3u"',
        'cache-control': 'private, max-age=60',
        'x-playlist-channels': String(built.channels),
        'x-playlist-skipped': String(built.skipped),
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
