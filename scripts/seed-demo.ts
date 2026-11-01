/**
 * Mark a few known-good channels as `isDemo` for the given org (default: root).
 * Demo channels are the only catalog a logged-out visitor can watch.
 *
 *   bun scripts/seed-demo.ts
 *   ORG_SLUG=acme bun scripts/seed-demo.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const ORG_SLUG = process.env.ORG_SLUG ?? process.env.ROOT_ORG_SLUG ?? 'root'

// Preferred picks by iptv-org sourceId; falls back to a name search.
const PREFERRED_SOURCE_IDS = ['9XM.in', 'ABPNews.in', 'DDNews.in', 'RepublicBharat.in']
const NAME_FALLBACKS = ['9XM', 'ABP News', 'DD News', 'Republic Bharat', 'NDTV']
const TARGET = 3

async function main() {
  const org = await db.organization.findUniqueOrThrow({ where: { slug: ORG_SLUG } })

  await db.channel.updateMany({ where: { organizationId: org.id }, data: { isDemo: false } })

  const pick = new Map<string, string>() // id -> name

  for (const sourceId of PREFERRED_SOURCE_IDS) {
    if (pick.size >= TARGET) break
    const ch = await db.channel.findFirst({
      where: { organizationId: org.id, sourceId, isActive: true, isNsfw: false, streams: { some: {} } },
      select: { id: true, name: true },
    })
    if (ch) pick.set(ch.id, ch.name)
  }

  for (const name of NAME_FALLBACKS) {
    if (pick.size >= TARGET) break
    const ch = await db.channel.findFirst({
      where: {
        organizationId: org.id,
        name: { contains: name },
        isActive: true,
        isNsfw: false,
        streams: { some: {} },
      },
      select: { id: true, name: true },
    })
    if (ch && !pick.has(ch.id)) pick.set(ch.id, ch.name)
  }

  // Last resort: any active Indian channel with a stream.
  if (pick.size < TARGET) {
    const extra = await db.channel.findMany({
      where: { organizationId: org.id, country: 'IN', isActive: true, isNsfw: false, streams: { some: {} } },
      take: TARGET - pick.size,
      select: { id: true, name: true },
    })
    for (const ch of extra) pick.set(ch.id, ch.name)
  }

  if (pick.size === 0) {
    console.error('No demo candidates found — is the catalog seeded?')
    process.exit(1)
  }

  const r = await db.channel.updateMany({
    where: { id: { in: [...pick.keys()] } },
    data: { isDemo: true },
  })
  console.log(`demo channels set: ${r.count}`)
  for (const name of pick.values()) console.log(`  - ${name}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
