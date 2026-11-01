import { adminRouteCtx } from '@/lib/server/auth'
import { listFailoverChannels, type HealthFilter } from '@/lib/server/failover'

export const dynamic = 'force-dynamic'

/** Failover dashboard: logical channels (deduped across portals) + their source health. */
export const GET = adminRouteCtx(async (request, _ctx, admin) => {
  const sp = new URL(request.url).searchParams
  const result = await listFailoverChannels(admin.organizationId, {
    search: sp.get('search') ?? undefined,
    filter: (sp.get('filter') as HealthFilter) || undefined,
    page: Number.parseInt(sp.get('page') ?? '1', 10),
  })
  return Response.json(result)
})
