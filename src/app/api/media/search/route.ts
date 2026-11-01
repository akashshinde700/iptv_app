import { jsonCached, mediaError, mediaGate } from '@/lib/server/media/gate'
import { resolveProvider } from '@/lib/server/media'

export const dynamic = 'force-dynamic'

/** Search titles across the active provider (catalog only — nxsha has no public search). */
export async function GET(request: Request) {
  try {
    const gate = await mediaGate(request)
    if (!gate.ok) return gate.response

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') ?? '').trim().slice(0, 120)
    if (q.length < 2) return jsonCached({ items: [] }, 30)

    const provider = await resolveProvider(searchParams.get('provider'))
    const items = await provider.search(gate.ctx, q)
    return jsonCached({ items }, 60)
  } catch (error) {
    return mediaError(error)
  }
}
