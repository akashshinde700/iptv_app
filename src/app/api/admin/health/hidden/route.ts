import { db } from '@/lib/db'
import { adminRouteCtx } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Channels the doctor auto-hid (every source dead). Operators can restore any of them. */
export const GET = adminRouteCtx(async (_request, _ctx, admin) => {
  const items = await db.channel.findMany({
    where: { organizationId: admin.organizationId, autoHiddenAt: { not: null } },
    select: { id: true, name: true, logo: true, healthStatus: true, autoHiddenAt: true },
    orderBy: { autoHiddenAt: 'desc' },
    take: 100,
  })
  return Response.json({ items })
})
