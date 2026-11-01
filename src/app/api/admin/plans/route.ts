import { db } from '@/lib/db'
import { adminRoute, audit } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

function toPipe(values: string[] | undefined): string {
  const clean = (values ?? []).map((v) => v.trim()).filter(Boolean)
  return clean.length > 0 ? `|${clean.join('|')}|` : '|'
}

export const GET = adminRoute(async (_request, admin) => {
  const plans = await db.plan.findMany({
    where: { organizationId: admin.organizationId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { customers: true } } },
  })
  return Response.json({
    items: plans.map((plan) => ({
      ...plan,
      regions: plan.regions.split('|').filter(Boolean),
      countries: plan.countries.split('|').filter(Boolean),
      languages: plan.languages.split('|').filter(Boolean),
      categories: plan.categories.split('|').filter(Boolean),
      customerCount: plan._count.customers,
    })),
  })
})

export const POST = adminRoute(async (request, admin) => {
  let body: {
    name?: string
    description?: string
    price?: number
    durationDays?: number
    allowAdult?: boolean
    maxDevices?: number
    regions?: string[]
    countries?: string[]
    languages?: string[]
    categories?: string[]
    isActive?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return Response.json({ error: 'Plan name zaroori hai' }, { status: 400 })

  const plan = await db.plan.create({
    data: {
      organizationId: admin.organizationId,
      name,
      description: body.description?.trim() || null,
      price: Math.max(0, Math.floor(body.price ?? 0)),
      durationDays: Math.max(1, Math.floor(body.durationDays ?? 30)),
      allowAdult: body.allowAdult ?? false,
      maxDevices: Math.max(1, Math.floor(body.maxDevices ?? 1)),
      regions: toPipe(body.regions),
      countries: toPipe(body.countries),
      languages: toPipe(body.languages),
      categories: toPipe(body.categories),
      isActive: body.isActive ?? true,
    },
  })

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PLAN_CREATE',
    entityType: 'PLAN',
    entityId: plan.id,
    newValue: { name, price: plan.price, durationDays: plan.durationDays },
    request,
  })

  return Response.json(plan, { status: 201 })
})
