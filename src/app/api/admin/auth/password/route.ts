/**
 * Change the signed-in admin's own password.
 *
 * Why this exists: the seeded owner used to ship with a well-known default and there was **no
 * way** to change it from the product — the Settings screen even said password management would
 * come "in a later version". An admin can now rotate their own credential, and doing so
 * invalidates every *other* session of that admin (a stolen cookie dies with the old password).
 */
import { db } from '@/lib/db'
import {
  ADMIN_COOKIE,
  audit,
  hashPassword,
  HttpError,
  readCookieToken,
  toErrorResponse,
  tokenFingerprint,
  verifyPassword,
} from '@/lib/server/auth'
import { passwordProblem } from '@/lib/server/password-rules'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const token = readCookieToken(request, ADMIN_COOKIE)
    if (!token) throw new HttpError(401, 'Unauthorized — admin login required')

    const session = await db.adminSession.findUnique({
      // The DB stores only the sha256 fingerprint of the cookie value, never the raw token.
      where: { token: tokenFingerprint(token) },
      include: { admin: { select: { id: true, username: true, passwordHash: true, organizationId: true } } },
    })
    if (!session || session.expiresAt < new Date()) throw new HttpError(401, 'Session expired — sign in again')

    let body: { currentPassword?: string; newPassword?: string }
    try {
      body = await request.json()
    } catch {
      throw new HttpError(400, 'Invalid request body')
    }

    const currentPassword = body.currentPassword ?? ''
    const newPassword = body.newPassword ?? ''

    if (!verifyPassword(currentPassword, session.admin.passwordHash)) {
      throw new HttpError(400, 'Current password is incorrect')
    }
    const problem = passwordProblem(newPassword)
    if (problem) throw new HttpError(400, problem)
    if (currentPassword === newPassword) {
      throw new HttpError(400, 'The new password must be different from the current one')
    }

    await db.$transaction(async (tx) => {
      await tx.admin.update({
        where: { id: session.admin.id },
        data: { passwordHash: hashPassword(newPassword) },
      })
      // Everything except the session making this request.
      await tx.adminSession.deleteMany({ where: { adminId: session.admin.id, id: { not: session.id } } })
    })

    await audit({
      organizationId: session.admin.organizationId,
      adminId: session.admin.id,
      adminName: session.admin.username,
      action: 'ADMIN_PASSWORD_CHANGE',
      entityType: 'ADMIN',
      entityId: session.admin.id,
      request,
    })

    return Response.json({ ok: true, otherSessionsSignedOut: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
