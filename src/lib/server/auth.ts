/**
 * Server-side auth utilities shared by admin + customer flows.
 * - Passwords hashed with node:crypto scrypt (salted, timing-safe compare).
 * - Sessions: random 48-byte tokens stored in DB, sent as httpOnly cookies.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { db } from '@/lib/db'

export const ADMIN_COOKIE = 'sk_admin_session'
export const CUSTOMER_COOKIE = 'sk_customer_session'
const SESSION_DAYS = 7

/* ------------------------------ Passwords -------------------------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split('$')
    if (scheme !== 'scrypt' || !salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

/* ------------------------------- Sessions -------------------------------- */

function newToken(): string {
  return randomBytes(48).toString('base64url')
}

function expiry(days = SESSION_DAYS): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export function sessionCookie(name: string, token: string, expiresAt: Date): string {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`
}

export function clearSessionCookie(name: string): string {
  // Mirror the flags used when setting it, otherwise some browsers keep the old cookie around.
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`
}

/** Raw cookie value (used by flows that need the token itself, e.g. password change). */
export function readCookieToken(request: Request, name: string): string | null {
  return readCookie(request, name)
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** True when Prisma rejected a write because of a unique constraint (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

/**
 * Best-effort client IP. `x-forwarded-for` is a client→proxy→…→us chain; the
 * left-most entry is attacker-controlled, so trust the RIGHT-most hop (added by
 * our own reverse proxy). Falls back to x-real-ip.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  return request.headers.get('x-real-ip') ?? 'local'
}

export interface AdminIdentity {
  id: string
  username: string
  email: string
  role: string
  organizationId: string
  isPlatformStaff: boolean
}

export interface CustomerIdentity {
  id: string
  username: string
  name: string
  status: string
  organizationId: string
  planId: string | null
  planExpiresAt: Date | null
}

/** Create a DB session row for an admin and return cookie value parts.
 *  Only the sha256 fingerprint is persisted — the raw token lives solely in
 *  the httpOnly cookie, so a DB leak cannot be replayed as a live session. */
export async function createAdminSession(adminId: string, request: Request) {
  const token = newToken()
  const expiresAt = expiry()
  await db.adminSession.create({
    data: {
      token: tokenFingerprint(token),
      adminId,
      expiresAt,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    },
  })
  return { token, expiresAt }
}

export async function createCustomerSession(customerId: string, request: Request) {
  const token = newToken()
  const expiresAt = expiry()
  await db.customerSession.create({
    data: {
      token: tokenFingerprint(token),
      customerId,
      expiresAt,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent') ?? undefined,
    },
  })
  return { token, expiresAt }
}

/**
 * Concurrent-device limit (Plan.maxDevices). Called right before a new login
 * session is created: drops expired sessions, then evicts the oldest live ones
 * so at most `maxDevices - 1` remain (leaving room for the one about to be made).
 * Returns how many active devices were kicked.
 */
export async function enforceDeviceLimit(customerId: string, maxDevices: number): Promise<number> {
  const keep = Math.max(0, Math.floor(maxDevices) - 1)

  await db.customerSession.deleteMany({
    where: { customerId, expiresAt: { lt: new Date() } },
  })

  const live = await db.customerSession.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (live.length <= keep) return 0

  const evict = live.slice(keep).map((s) => s.id)
  await db.customerSession.deleteMany({ where: { id: { in: evict } } })
  return evict.length
}

/** Log the customer out of every device. */
export async function destroyAllCustomerSessions(customerId: string): Promise<number> {
  const { count } = await db.customerSession.deleteMany({ where: { customerId } })
  return count
}

/** Resolve the authenticated admin from the request cookie, or null. */
export async function getAdmin(request: Request): Promise<AdminIdentity | null> {
  const token = readCookie(request, ADMIN_COOKIE)
  if (!token) return null
  const session = await db.adminSession.findUnique({
    where: { token: tokenFingerprint(token) },
    include: {
      admin: {
        select: { id: true, username: true, email: true, role: true, isActive: true, organizationId: true, isPlatformStaff: true },
      },
    },
  })
  if (!session || session.expiresAt < new Date() || !session.admin.isActive) return null
  return {
    id: session.admin.id,
    username: session.admin.username,
    email: session.admin.email,
    role: session.admin.role,
    organizationId: session.admin.organizationId,
    isPlatformStaff: session.admin.isPlatformStaff,
  }
}

/** Resolve the authenticated customer from the request cookie, or null. */
export async function getCustomer(request: Request): Promise<CustomerIdentity | null> {
  const token = readCookie(request, CUSTOMER_COOKIE)
  if (!token) return null
  const session = await db.customerSession.findUnique({
    where: { token: tokenFingerprint(token) },
    include: { customer: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  const c = session.customer
  return {
    id: c.id,
    username: c.username,
    name: c.name,
    status: c.status,
    organizationId: c.organizationId,
    planId: c.planId,
    planExpiresAt: c.planExpiresAt,
  }
}

export async function destroySession(cookieName: string, request: Request) {
  const token = readCookie(request, cookieName)
  if (!token) return
  const fp = tokenFingerprint(token)
  if (cookieName === ADMIN_COOKIE) {
    await db.adminSession.deleteMany({ where: { token: fp } })
  } else {
    await db.customerSession.deleteMany({ where: { token: fp } })
  }
}

/* ------------------------------ Route guards ------------------------------ */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Convert any thrown value into a proper Response (never a 500 crash). */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof Response) return error
  console.error('route error:', error)
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}

type RouteCtx<P> = { params: Promise<P> }

/** Wrap a public route handler with unified error handling. */
export function publicRoute(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/** Wrap an admin-only route handler: auth check + unified error handling. */
export function adminRoute(handler: (request: Request, admin: AdminIdentity) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      const admin = await requireAdmin(request)
      return await handler(request, admin)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/** Same as adminRoute but for dynamic routes (with [id]-style params). */
export function adminRouteCtx<P = Record<string, string>>(
  handler: (request: Request, ctx: RouteCtx<P>, admin: AdminIdentity) => Promise<Response>,
) {
  return async (request: Request, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      const admin = await requireAdmin(request)
      return await handler(request, ctx, admin)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/** Guard helper — throws HttpError(401) when not authenticated. */
export async function requireAdmin(request: Request): Promise<AdminIdentity> {
  const admin = await getAdmin(request)
  if (!admin) {
    throw new HttpError(401, 'Unauthorized — admin login required')
  }
  return admin
}

/** Guard helper for super-admin-only operations. */
export async function requireSuperAdmin(request: Request): Promise<AdminIdentity> {
  const admin = await requireAdmin(request)
  if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'OWNER') {
    throw new HttpError(403, 'Forbidden — owner only')
  }
  return admin
}

/** Guard helper for the platform console (StreamKaro staff, cross-tenant). */
export async function requirePlatformStaff(request: Request): Promise<AdminIdentity> {
  const admin = await requireAdmin(request)
  if (!admin.isPlatformStaff) {
    throw new HttpError(403, 'Forbidden — platform staff only')
  }
  return admin
}

/** Wrap a platform-console route: platform-staff auth + unified error handling. */
export function platformRoute(handler: (request: Request, admin: AdminIdentity) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      const admin = await requirePlatformStaff(request)
      return await handler(request, admin)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/** Platform route with dynamic [id] params. */
export function platformRouteCtx<P = Record<string, string>>(
  handler: (request: Request, ctx: RouteCtx<P>, admin: AdminIdentity) => Promise<Response>,
) {
  return async (request: Request, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      const admin = await requirePlatformStaff(request)
      return await handler(request, ctx, admin)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/* ------------------------------ Rate limiting ----------------------------- */

const buckets = new Map<string, { count: number; resetAt: number }>()
let lastSweep = 0

/**
 * Fixed-window in-memory rate limiter (per process).
 * NOTE: process-local — behind multiple instances move this to Redis. Good
 * enough for a single-node deploy; the map is swept so it cannot grow forever.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()

  if (now - lastSweep > 60_000) {
    lastSweep = now
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k)
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

/* --------------------------------- Audit --------------------------------- */

export async function audit(entry: {
  organizationId?: string | null
  adminId?: string | null
  adminName?: string
  action: string
  entityType?: string
  entityId?: string
  oldValue?: unknown
  newValue?: unknown
  request?: Request
}) {
  try {
    // Derive the org from the acting admin when the caller didn't pass one.
    let organizationId = entry.organizationId ?? null
    if (!organizationId && entry.adminId) {
      const admin = await db.admin.findUnique({
        where: { id: entry.adminId },
        select: { organizationId: true },
      })
      organizationId = admin?.organizationId ?? null
    }

    await db.auditLog.create({
      data: {
        organizationId,
        adminId: entry.adminId ?? null,
        adminName: entry.adminName ?? 'system',
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        oldValue: entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
        newValue: entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
        ip: entry.request ? clientIp(entry.request) : null,
      },
    })
  } catch (error) {
    console.error('audit log failed', error)
  }
}
