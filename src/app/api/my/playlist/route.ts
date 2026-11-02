import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { playlistPath } from '@/lib/server/playlist'
import { publicOrigin } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

/**
 * The signed-in customer's personal playlist link (used by Settings → "Watch in other apps").
 * The link is a bearer credential, so it is only ever returned to an authenticated session.
 */
export async function GET(request: Request) {
  try {
    const identity = await getCustomer(request)
    if (!identity) {
      return Response.json({ error: 'Plan required', accessDenied: true, reason: 'guest' }, { status: 403 })
    }
    // Behind the reverse proxy request.url is the internal origin (http://localhost:3333).
    const origin = publicOrigin(request)
    const path = playlistPath(identity.id)
    return Response.json(
      {
        path,
        url: `${origin}${path}`,
        apps: ['VLC', 'TiviMate', 'OTT Navigator', 'Kodi', 'IPTV Smarters', 'GSE Smart IPTV'],
        note: 'Any IPTV player can open this link. Streams are refreshed from your plan and dead sources are skipped automatically.',
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
