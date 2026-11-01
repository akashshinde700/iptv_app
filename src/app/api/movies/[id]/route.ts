import { db } from '@/lib/db'
import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { splitPipe } from '@/lib/server/iptv'
import { signedProxyPath } from '@/lib/server/proxy-sign'
import { movieStreamUrl } from '@/lib/server/sync/vod'

export const dynamic = 'force-dynamic'

/** Movie detail + a signed same-origin play URL (raw upstream/credentials never reach the client). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const identity = await getCustomer(request)
    if (!identity) {
      return Response.json({ error: 'Plan required', accessDenied: true, reason: 'guest' }, { status: 403 })
    }
    const { state } = await buildCustomerChannelWhere(identity.id)
    if (!state.hasAccess) {
      return Response.json({ error: state.reason, accessDenied: true, reason: state.reason }, { status: 403 })
    }
    const organizationId = state.organizationId ?? identity.organizationId

    const movie = await db.movie.findFirst({
      where: { id, organizationId, isActive: true, isNsfw: false },
      select: { id: true, title: true, poster: true, plot: true, year: true, rating: true, genre: true, categories: true, containerExt: true },
    })
    if (!movie) return Response.json({ error: 'Movie not found' }, { status: 404 })

    const src = await movieStreamUrl(id, organizationId)
    const playUrl = src ? signedProxyPath(src.url, src.ua, src.ref) : null

    return Response.json({
      movie: {
        id: movie.id,
        title: movie.title,
        poster: movie.poster,
        plot: movie.plot,
        year: movie.year,
        rating: movie.rating,
        genre: movie.genre,
        categories: splitPipe(movie.categories),
        containerExt: movie.containerExt,
        playUrl,
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
