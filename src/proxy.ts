import { NextResponse, type NextRequest } from 'next/server'

// Kept in sync with ADMIN_COOKIE in lib/server/auth.ts (that module pulls in
// Prisma, which cannot run in the edge middleware runtime).
const ADMIN_COOKIE = 'sk_admin_session'

/**
 * Edge middleware — cheap, first-line defense. Real auth still happens in the
 * route handlers (adminRoute / getCustomer); this only fast-fails obviously
 * unauthenticated admin traffic and sets baseline security headers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Fast-fail admin + platform APIs when the session cookie is entirely absent.
  const needsAdminCookie =
    (pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/auth/login')) ||
    pathname.startsWith('/api/platform')
  if (needsAdminCookie && !request.cookies.get(ADMIN_COOKIE)) {
    return NextResponse.json({ error: 'Unauthorized — admin login required' }, { status: 401 })
  }

  const res = NextResponse.next()
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'browser=(), geolocation=(), microphone=()')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest).*)'],
}
