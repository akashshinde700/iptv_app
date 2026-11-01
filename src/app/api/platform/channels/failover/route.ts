import { platformRoute } from '@/lib/server/auth'
import { listFailoverChannels, type HealthFilter } from '@/lib/server/failover'

export const dynamic = 'force-dynamic'

/** Failover dashboard for the platform console — optionally scoped to one organization. */
export const GET = platformRoute(async (request) => {
  const sp = new URL(request.url).searchParams
  const organizationId = sp.get('organizationId') || undefined
  const result = await listFailoverChannels(organizationId, {
    search: sp.get('search') ?? undefined,
    filter: (sp.get('filter') as HealthFilter) || undefined,
    page: Number.parseInt(sp.get('page') ?? '1', 10),
  })
  return Response.json(result)
})
