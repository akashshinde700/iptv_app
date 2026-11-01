import { jsonCached, mediaError, mediaGate } from '@/lib/server/media/gate'
import { resolveProvider } from '@/lib/server/media'

export const dynamic = 'force-dynamic'

/** Playable sources for a title (or one episode): signed proxy paths + subtitle tracks. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await mediaGate(request)
    if (!gate.ok) return gate.response

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const season = Math.max(1, Number.parseInt(searchParams.get('season') ?? '1', 10) || 1)
    const episode = Math.max(1, Number.parseInt(searchParams.get('episode') ?? '1', 10) || 1)

    const provider = await resolveProvider(searchParams.get('provider') ?? (id.startsWith('nxsha:') ? 'nxsha' : null))
    const sources = await provider.sources(gate.ctx, id, { season, episode })
    if (!sources) {
      return Response.json({ error: 'No playable source for this title', noSource: true }, { status: 404 })
    }
    return jsonCached(sources, 30)
  } catch (error) {
    return mediaError(error)
  }
}
