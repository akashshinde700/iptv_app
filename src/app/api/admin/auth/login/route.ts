import { db } from '@/lib/db'
import { ADMIN_COOKIE, clientIp, createAdminSession, rateLimit, sessionCookie, verifyPassword } from '@/lib/server/auth'
import { resolveTenantId, storefrontSlugFromHost } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const organizationId = await resolveTenantId(request)
    const ip = clientIp(request)
    if (!rateLimit(`admin-login:${organizationId}:${ip}`, 10, 60_000)) {
      return Response.json({ error: 'Bahut zyada attempts. 1 minute baad try karo.' }, { status: 429 })
    }

    let body: { username?: string; password?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const username = body.username?.trim()
    const password = body.password ?? ''
    if (!username || !password) {
      return Response.json({ error: 'Username aur password dono zaroori hain' }, { status: 400 })
    }

    /**
     * SEC-06: platform staff used to be able to sign in through ANY operator's storefront
     * (`acme.streamkaro.app/admin`), which meant a support account appeared as a valid login on a
     * customer-facing page — and gave that page a working cross-tenant entry point. Platform staff
     * now sign in only on the platform host (apex / no tenant slug); on a storefront, only that
     * organization's own admins are accepted.
     */
    const onTenantStorefront = storefrontSlugFromHost(request.headers.get('host')) !== null
    const admin = await db.admin.findFirst({
      where: {
        OR: [{ username }, { email: username }],
        AND: [{ OR: onTenantStorefront ? [{ organizationId }] : [{ organizationId }, { isPlatformStaff: true }] }],
      },
    })
    if (!admin || !admin.isActive || !verifyPassword(password, admin.passwordHash)) {
      return Response.json({ error: 'Galat username ya password' }, { status: 401 })
    }

    const { token, expiresAt } = await createAdminSession(admin.id, request)

    return new Response(JSON.stringify({ ok: true, admin: { username: admin.username, role: admin.role } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(ADMIN_COOKIE, token, expiresAt) },
    })
  } catch (error) {
    console.error('admin login error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
