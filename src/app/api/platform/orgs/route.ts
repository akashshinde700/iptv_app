import { db } from '@/lib/db'
import { audit, HttpError, hashPassword, platformRoute } from '@/lib/server/auth'
import { RESERVED_SLUGS } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

/** Platform console: list every tenant with headline counts. */
export const GET = platformRoute(async (request) => {
  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim().toLowerCase() || undefined
  const status = searchParams.get('status') || undefined

  const orgs = await db.organization.findMany({
    where: {
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(search
        ? { OR: [{ name: { contains: search } }, { slug: { contains: search } }] }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { customers: true, channels: true, portals: true, plans: true, admins: true } },
    },
  })

  return Response.json({
    items: orgs.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      status: o.status,
      platformPlan: o.platformPlan,
      platformTrialEndsAt: o.platformTrialEndsAt,
      platformValidUntil: o.platformValidUntil,
      customDomain: o.customDomain,
      createdAt: o.createdAt,
      counts: o._count,
    })),
  })
})

/** Platform staff manually provisions a tenant + its owner. */
export const POST = platformRoute(async (request, admin) => {
  let body: {
    name?: string
    slug?: string
    ownerName?: string
    ownerEmail?: string
    ownerUsername?: string
    ownerPassword?: string
    platformPlan?: string
  }
  try {
    body = await request.json()
  } catch {
    throw new HttpError(400, 'Invalid request body')
  }

  const name = body.name?.trim()
  const slug = body.slug?.trim().toLowerCase()
  const ownerEmail = body.ownerEmail?.trim().toLowerCase()
  const ownerUsername = body.ownerUsername?.trim().toLowerCase()
  const ownerPassword = body.ownerPassword ?? ''

  if (!name || !slug || !ownerEmail || !ownerUsername || !ownerPassword) {
    throw new HttpError(400, 'name, slug, owner email/username/password zaroori hain')
  }
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    throw new HttpError(400, 'Invalid ya reserved slug')
  }
  if (ownerPassword.length < 8) throw new HttpError(400, 'Owner password min 8 chars')

  const clash = await db.organization.findUnique({ where: { slug }, select: { id: true } })
  if (clash) throw new HttpError(409, 'Slug already taken')

  const org = await db.organization.create({
    data: {
      slug,
      name,
      status: 'ACTIVE',
      platformPlan: body.platformPlan ?? 'STARTER',
      supportEmail: ownerEmail,
      admins: {
        create: {
          username: ownerUsername,
          email: ownerEmail,
          passwordHash: hashPassword(ownerPassword),
          role: 'OWNER',
          isActive: true,
        },
      },
    },
  })

  await audit({
    organizationId: org.id,
    adminId: admin.id,
    adminName: admin.username,
    action: 'PLATFORM_ORG_CREATE',
    entityType: 'ORGANIZATION',
    entityId: org.id,
    newValue: { slug, name, platformPlan: org.platformPlan },
    request,
  })

  return Response.json({ ok: true, id: org.id, slug: org.slug }, { status: 201 })
})
