import { mediaError } from '@/lib/server/media/gate'
import { providerStatus } from '@/lib/server/media'

export const dynamic = 'force-dynamic'

/** Which media provider this deployment serves, and whether the optional ones are on. */
export async function GET() {
  try {
    return Response.json(providerStatus())
  } catch (error) {
    return mediaError(error)
  }
}
