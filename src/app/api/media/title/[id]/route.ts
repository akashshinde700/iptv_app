import { jsonCached, mediaError, mediaGate } from '@/lib/server/media/gate'
import { resolveProvider } from '@/lib/server/media'

export const dynamic = 'force-dynamic'

/** Title detail: metadata + (series) seasons/episodes + a signed play URL for movies. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await mediaGate(request)
    if (!gate.ok) return gate.response

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const seasonParam = Number.parseInt(searchParams.get('season') ?? '1', 10)
    const season = Number.isFinite(seasonParam) && seasonParam > 0 ? seasonParam : 1

    const provider = await resolveProvider(searchParams.get('provider') ?? (id.startsWith('nxsha:') ? 'nxsha' : null))
    const detail = await provider.detail(gate.ctx, id, season)
    if (!detail) return Response.json({ error: 'Title not found' }, { status: 404 })
    return jsonCached(detail, 60)
  } catch (error) {
    return mediaError(error)
  }
}
