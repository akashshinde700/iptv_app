import { db } from '@/lib/db'
import { RESERVED_SLUGS } from '@/lib/server/tenant'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

/** Live subdomain availability check for the signup form. */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug')?.trim().toLowerCase() ?? ''
  if (!SLUG_RE.test(slug)) {
    return Response.json({ available: false, reason: 'invalid' })
  }
  if (RESERVED_SLUGS.has(slug)) {
    return Response.json({ available: false, reason: 'reserved' })
  }
  const taken = await db.organization.findUnique({ where: { slug }, select: { id: true } })
  return Response.json({ available: !taken, reason: taken ? 'taken' : null })
}
