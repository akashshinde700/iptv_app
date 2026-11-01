/**
 * Tenant (Organization) resolution.
 *
 * The storefront is multi-tenant by subdomain:  <slug>.streamkaro.app
 * A single-operator install just runs everything under one "root" org and the
 * bare apex / localhost resolves to it.
 *
 * Every customer-facing and org-admin query MUST be scoped to the id returned
 * here — never trust an organizationId from the request body.
 */
import type { Organization } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/server/auth'

export const ROOT_ORG_SLUG = process.env.ROOT_ORG_SLUG ?? 'root'

/**
 * The domain tenant subdomains hang off:  <slug>.<STOREFRONT_BASE_DOMAIN>
 * Defaults cover the eventual streamkaro.app; the live deploy sets it to
 * `streamkaro.aetherdevsolutions.in`.
 */
const BASE_DOMAINS = (process.env.STOREFRONT_BASE_DOMAIN ?? 'streamkaro.app,streamkaro.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean)

/** Hosts that are NOT a tenant subdomain — they map to the root org. */
const APEX_HOSTS = new Set<string>([
  'localhost',
  '127.0.0.1',
  ...BASE_DOMAINS,
  ...BASE_DOMAINS.map((d) => `www.${d}`),
])

/** Reserved sub-labels that can never be an operator slug. */
export const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'app', 'platform', 'dashboard', 'console', 'static', 'assets',
  'cdn', 'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'status', 'help', 'support', 'docs', 'blog',
  'root', 'internal', 'test', 'staging', 'dev',
])

function slugFromHost(host: string | null): string | null {
  if (!host) return null
  const bare = host.split(':')[0].toLowerCase().trim()
  if (APEX_HOSTS.has(bare)) return null

  // <slug>.<base domain>
  for (const base of BASE_DOMAINS) {
    if (bare.endsWith(`.${base}`)) {
      const label = bare.slice(0, -(base.length + 1))
      // ignore a leading "www." wrapper (www.<slug>.<base>)
      const slug = label.startsWith('www.') ? label.slice(4) : label
      if (slug && !slug.includes('.')) return slug
    }
  }

  // Local dev: foo.localhost
  const local = bare.match(/^([a-z0-9-]+)\.localhost$/)
  if (local) return local[1]

  return null // custom domains handled by customDomain lookup below
}

let rootOrgIdCache: string | null = null

async function rootOrgId(): Promise<string> {
  if (rootOrgIdCache) return rootOrgIdCache
  const org = await db.organization.findUnique({ where: { slug: ROOT_ORG_SLUG }, select: { id: true } })
  if (!org) throw new Error(`Root organization "${ROOT_ORG_SLUG}" is missing — run scripts/backfill-org.ts`)
  rootOrgIdCache = org.id
  return org.id
}

export interface TenantContext {
  id: string
  slug: string
  name: string
  status: string
  appName: string | null
  logoUrl: string | null
  primaryColor: string | null
}

function toCtx(org: Organization): TenantContext {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    status: org.status,
    appName: org.appName,
    logoUrl: org.logoUrl,
    primaryColor: org.primaryColor,
  }
}

/**
 * Resolve the tenant for an incoming request.
 * - `<slug>.streamkaro.app` with no matching org  → 404 (no silent root fallback)
 * - a verified custom domain                      → that org
 * - apex / localhost                              → root org
 */
export async function resolveTenant(request: Request): Promise<TenantContext> {
  const host = request.headers.get('host')
  // Dev/testing override header (never trusted in prod behind the real proxy).
  const devSlug = process.env.NODE_ENV !== 'production' ? request.headers.get('x-org-slug') : null
  const slug = devSlug || slugFromHost(host)

  if (slug) {
    const org = await db.organization.findUnique({ where: { slug } })
    if (!org) throw new HttpError(404, 'Storefront not found')
    return toCtx(org)
  }

  if (host) {
    const bare = host.split(':')[0].toLowerCase()
    const org = await db.organization.findFirst({ where: { customDomain: bare } }).catch(() => null)
    if (org) return toCtx(org)
  }

  const root = await db.organization.findUnique({ where: { id: await rootOrgId() } })
  if (!root) throw new Error('root org missing')
  return toCtx(root)
}

/** Just the id — the common case for query scoping. */
export async function resolveTenantId(request: Request): Promise<string> {
  return (await resolveTenant(request)).id
}

/** The primary base domain for building `<slug>.<domain>` storefront URLs. */
export function storefrontBaseDomain(): string {
  return BASE_DOMAINS[0] ?? 'streamkaro.app'
}

/** Resolve the tenant and reject when the operator's storefront is switched off. */
export async function resolveActiveTenant(request: Request): Promise<TenantContext> {
  const tenant = await resolveTenant(request)
  if (tenant.status === 'SUSPENDED') {
    throw new HttpError(403, 'This storefront is currently unavailable — please contact the operator')
  }
  return tenant
}
