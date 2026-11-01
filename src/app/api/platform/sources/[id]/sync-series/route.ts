import { audit, HttpError, platformRouteCtx } from '@/lib/server/auth'
import { syncPortalSeries } from '@/lib/server/sync/series'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Import / refresh the TV Shows (Series) catalog for an Xtream source.
 * Episodes are fetched lazily on first open, so this is as fast as the Movies sync
 * even for panels with thousands of titles.
 */
export const POST = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  try {
    const result = await syncPortalSeries(id)
    await audit({ adminId: admin.id, adminName: admin.username, action: 'SOURCE_SYNC_SERIES', entityType: 'PORTAL', entityId: id, newValue: result, request })
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Series sync failed'
    await audit({ adminId: admin.id, adminName: admin.username, action: 'SOURCE_SYNC_SERIES_FAILED', entityType: 'PORTAL', entityId: id, newValue: { error: message }, request })
    throw new HttpError(502, message)
  }
})
