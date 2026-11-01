import { db } from '@/lib/db'
import {
  clearSessionCookie,
  CUSTOMER_COOKIE,
  destroyAllCustomerSessions,
  getCustomer,
  toErrorResponse,
} from '@/lib/server/auth'
import { createHash } from 'node:crypto'

export const dynamic = 'force-dynamic'

function currentFingerprint(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === CUSTOMER_COOKIE) return createHash('sha256').update(rest.join('=')).digest('hex')
  }
  return null
}

/** List the customer's active devices. */
export async function GET(request: Request) {
  try {
    const identity = await getCustomer(request)
    if (!identity) return Response.json({ error: 'Login required' }, { status: 401 })

    const fp = currentFingerprint(request)
    const sessions = await db.customerSession.findMany({
      where: { customerId: identity.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ip: true, userAgent: true, createdAt: true, token: true },
    })

    return Response.json({
      items: sessions.map((s) => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        current: s.token === fp,
      })),
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

/** Log out of every device. */
export async function DELETE(request: Request) {
  try {
    const identity = await getCustomer(request)
    if (!identity) return Response.json({ error: 'Login required' }, { status: 401 })

    const count = await destroyAllCustomerSessions(identity.id)
    return new Response(JSON.stringify({ ok: true, cleared: count }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(CUSTOMER_COOKIE) },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
