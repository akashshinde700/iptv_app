import { clearSessionCookie, CUSTOMER_COOKIE, destroySession } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  await destroySession(CUSTOMER_COOKIE, request)
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(CUSTOMER_COOKIE) },
  })
}
