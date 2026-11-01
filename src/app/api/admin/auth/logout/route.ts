import { audit, clearSessionCookie, destroySession, getAdmin, ADMIN_COOKIE } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const admin = await getAdmin(request)
  await destroySession(ADMIN_COOKIE, request)
  if (admin) {
    await audit({
      adminId: admin.id,
      adminName: admin.username,
      action: 'ADMIN_LOGOUT',
      entityType: 'ADMIN',
      entityId: admin.id,
      request,
    })
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearSessionCookie(ADMIN_COOKIE) },
  })
}
