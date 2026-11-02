import { timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { runHealthSweep } from '@/lib/server/health-doctor'
import { reconcileCustomerAccess } from '@/lib/server/billing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Scheduled health sweep — the "no one has to click anything" path.
 *
 * Call it from any scheduler (Vercel Cron, GitHub Actions, cron + curl, systemd timer):
 *
 *   curl -fsS -X POST https://your-host/api/cron/health \
 *        -H "authorization: Bearer $CRON_SECRET"
 *
 * Set CRON_SECRET in the environment. Without it the route refuses to run (503), so a
 * deployment can never accidentally expose an unauthenticated probe endpoint.
 * A `?org=<slug>` query limits the run to one tenant.
 */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  const header = request.headers.get('authorization') ?? ''
  const provided = header.replace(/^Bearer\s+/i, '') || request.headers.get('x-cron-secret') || ''
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const slug = url.searchParams.get('org')
  const budgetMs = Number(url.searchParams.get('budgetMs') ?? '') || undefined

  // BUG-14: flip lapsed plans to their real state before the sweep, so the numbers the sweep
  // reports (and the "expired" counters in both dashboards) match reality.
  const billing = await reconcileCustomerAccess({ limit: 200 }).catch((error) => {
    console.error('cron: access reconciliation failed', error)
    return null
  })

  const orgs = await db.organization.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] }, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true },
    take: 50,
  })

  // Typed explicitly: `const results = []` infers `never[]`, which the build's type check rejects.
  const results: Array<Record<string, unknown>> = []
  for (const org of orgs) {
    // A shared budget across tenants keeps one cron invocation bounded.
    results.push({
      organization: org.slug,
      ...(await runHealthSweep({ organizationId: org.id }, { budgetMs: budgetMs ?? 15_000, batch: 60 })),
    })
  }

  return Response.json({ ok: true, organizations: results.length, billing, results })
}

export const GET = handle
export const POST = handle
