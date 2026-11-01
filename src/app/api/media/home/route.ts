import { jsonCached, mediaError, mediaGate } from '@/lib/server/media/gate'
import { resolveProvider, type MediaTab } from '@/lib/server/media'

export const dynamic = 'force-dynamic'

const TABS = new Set<MediaTab>(['home', 'movies', 'series', 'anime'])

/** Home hub for the active media provider: hero carousel + rails. Plan-gated. */
export async function GET(request: Request) {
  try {
    const gate = await mediaGate(request)
    if (!gate.ok) return gate.response

    const { searchParams } = new URL(request.url)
    const rawTab = searchParams.get('tab') ?? 'home'
    const tab: MediaTab = TABS.has(rawTab as MediaTab) ? (rawTab as MediaTab) : 'home'
    const provider = await resolveProvider(searchParams.get('provider'))

    const home = await provider.home(gate.ctx, tab)
    return jsonCached(home, 60)
  } catch (error) {
    return mediaError(error)
  }
}
