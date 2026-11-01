import { audit, adminRouteCtx } from '@/lib/server/auth'
import { runHealthSweep } from '@/lib/server/health-doctor'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Probe a batch of streams, auto-disable the dead ones and auto-hide channels that have
 * nothing playable left. Safe to call repeatedly: each run continues where the last stopped
 * (never-probed / most-recently-failed first), and a fixed time budget keeps the request
 * short. Wire /api/cron/health to a scheduler for the fully automatic version.
 */
export const POST = adminRouteCtx(async (request, _ctx, admin) => {
  let body: { batch?: number; budgetMs?: number } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    /* empty body is fine */
  }

  const summary = await runHealthSweep(
    { organizationId: admin.organizationId },
    {
      batch: Number.isFinite(body.batch) ? Math.min(Math.max(Number(body.batch), 1), 500) : undefined,
      budgetMs: Number.isFinite(body.budgetMs) ? Math.min(Math.max(Number(body.budgetMs), 3000), 280_000) : undefined,
    },
  )

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'HEALTH_SWEEP',
    entityType: 'ORGANIZATION',
    entityId: admin.organizationId,
    newValue: summary,
    request,
  })

  return Response.json({ ok: true, summary })
})
