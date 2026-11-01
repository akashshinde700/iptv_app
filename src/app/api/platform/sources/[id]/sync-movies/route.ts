import { audit, HttpError, platformRouteCtx } from '@/lib/server/auth'
import { syncPortalMovies } from '@/lib/server/sync/vod'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Import / refresh the Movies (VOD) catalog for an Xtream source. */
export const POST = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  try {
    const result = await syncPortalMovies(id)
    await audit({ adminId: admin.id, adminName: admin.username, action: 'SOURCE_SYNC_MOVIES', entityType: 'PORTAL', entityId: id, newValue: result, request })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Movies sync failed'
    await audit({ adminId: admin.id, adminName: admin.username, action: 'SOURCE_SYNC_MOVIES_FAILED', entityType: 'PORTAL', entityId: id, newValue: { error: message }, request })
    throw new HttpError(502, message)
  }
})
