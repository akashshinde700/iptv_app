import { db } from '@/lib/db'
import { getAdmin } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const admin = await getAdmin(request)
  if (!admin) return Response.json({ admin: null }, { status: 200 })

  const org = await db.organization.findUnique({
    where: { id: admin.organizationId },
    select: {
      id: true, slug: true, name: true, status: true, appName: true,
      platformPlan: true, platformTrialEndsAt: true, platformValidUntil: true,
    },
  })

  return Response.json({ admin, organization: org })
}
