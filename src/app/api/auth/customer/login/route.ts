import { db } from '@/lib/db'
import { clientIp, createCustomerSession, CUSTOMER_COOKIE, enforceDeviceLimit, rateLimit, sessionCookie, toErrorResponse, verifyPassword } from '@/lib/server/auth'
import { resolveActiveTenant } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { id: organizationId } = await resolveActiveTenant(request)
    const ip = clientIp(request)
    if (!rateLimit(`cust-login:${organizationId}:${ip}`, 10, 60_000)) {
      return Response.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 })
    }

    let body: { username?: string; password?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const username = body.username?.trim().toLowerCase()
    const password = body.password ?? ''
    if (!username || !password) {
      return Response.json({ error: 'Username and password are both required' }, { status: 400 })
    }

    const customer = await db.customer.findFirst({
      where: { organizationId, OR: [{ username }, { email: username }] },
      include: { plan: { select: { name: true, maxDevices: true } } },
    })
    if (!customer || !verifyPassword(password, customer.passwordHash)) {
      return Response.json({ error: 'Incorrect username or password' }, { status: 401 })
    }

    // Server-side status enforcement: INACTIVE / SUSPENDED customers can't log in.
    let status = customer.status
    const now = new Date()
    if (status === 'ACTIVE' && customer.planExpiresAt && customer.planExpiresAt < now) {
      status = 'EXPIRED'
      await db.customer.update({ where: { id: customer.id }, data: { status: 'EXPIRED' } })
    }
    if (status !== 'ACTIVE') {
      return Response.json(
        {
          error:
            status === 'SUSPENDED'
              ? 'Your account has been suspended — please contact the admin'
              : status === 'EXPIRED'
                ? 'Your plan has expired — please renew'
                : 'Your account is inactive — please contact the admin',
          status,
        },
        { status: 403 },
      )
    }

    await db.customer.update({ where: { id: customer.id }, data: { lastLoginAt: now } })

    // Concurrent-device cap: evict the oldest device(s) so this login fits.
    const kicked = await enforceDeviceLimit(customer.id, customer.plan?.maxDevices ?? 1)
    const { token, expiresAt } = await createCustomerSession(customer.id, request)

    return new Response(
      JSON.stringify({
        ok: true,
        deviceLimit: customer.plan?.maxDevices ?? 1,
        devicesKicked: kicked,
        customer: { username: customer.username, name: customer.name, plan: customer.plan?.name ?? null },
      }),
      { headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(CUSTOMER_COOKIE, token, expiresAt) } },
    )
  } catch (error) {
    return toErrorResponse(error)
  }
}
