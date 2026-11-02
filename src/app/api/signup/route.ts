import { db } from '@/lib/db'
import { clientIp, hashPassword, isUniqueViolation, rateLimit, toErrorResponse, HttpError } from '@/lib/server/auth'
import { RESERVED_SLUGS, storefrontBaseDomain } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/ // 3–40 chars, no leading/trailing dash
const TRIAL_DAYS = 14

/**
 * Operator self-signup — creates a new tenant (Organization) + its OWNER admin
 * on a free trial. Public + rate-limited. The end-customer storefront then
 * lives at  <slug>.streamkaro.app.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request)
    if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000)) {
      throw new HttpError(429, 'Too many signups — try again shortly')
    }

    let body: {
      orgName?: string
      slug?: string
      adminName?: string
      email?: string
      username?: string
      password?: string
    }
    try {
      body = await request.json()
    } catch {
      throw new HttpError(400, 'Invalid request body')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request body')

    const orgName = body.orgName?.trim()
    const slug = body.slug?.trim().toLowerCase()
    const adminName = body.adminName?.trim()
    const email = body.email?.trim().toLowerCase()
    const username = body.username?.trim().toLowerCase()
    const password = body.password ?? ''

    if (!orgName || !slug || !adminName || !email || !username || !password) {
      throw new HttpError(400, 'All fields are required')
    }
    if (!SLUG_RE.test(slug)) {
      throw new HttpError(400, 'Subdomain must be 3–40 chars: a-z, 0-9 and - only (not at the start or end)')
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new HttpError(409, 'That subdomain is reserved — please choose another')
    }
    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters')
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new HttpError(400, 'Enter a valid email')
    }

    const slugTaken = await db.organization.findUnique({ where: { slug }, select: { id: true } })
    if (slugTaken) throw new HttpError(409, 'That subdomain is already taken')

    const now = new Date()
    // Two requests can pass the availability check above at the same time; the unique index on
    // Organization.slug is the real arbiter, so translate its error instead of leaking a 500.
    let org: { id: string; slug: string; platformTrialEndsAt: Date | null }
    try {
      org = await db.organization.create({
        data: {
          slug,
          name: orgName,
          status: 'TRIAL',
          platformPlan: 'TRIAL',
          platformTrialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          supportEmail: email,
          admins: {
            create: {
              username,
              email,
              passwordHash: hashPassword(password),
              role: 'OWNER',
              isActive: true,
              isPlatformStaff: false,
            },
          },
        },
        select: { id: true, slug: true, platformTrialEndsAt: true },
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'That subdomain was just taken — please choose another')
      }
      throw error
    }

    const base = storefrontBaseDomain()
    return Response.json(
      {
        ok: true,
        slug: org.slug,
        storefrontUrl: `https://${org.slug}.${base}`,
        adminUrl: `https://${org.slug}.${base}/admin`,
        trialEndsAt: org.platformTrialEndsAt,
      },
      { status: 201 },
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
