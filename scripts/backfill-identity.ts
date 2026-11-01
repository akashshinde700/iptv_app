/**
 * One-time backfill: set Channel.identityKey for every channel that doesn't have one yet,
 * so cross-portal source failover (matching the same channel across Xtream / M3U / Stalker
 * portals) works for channels that were synced before identityKey existed.
 *
 * Idempotent — only touches rows where identityKey IS NULL. Safe to re-run.
 *
 * Run: bun scripts/backfill-identity.ts
 */
import { PrismaClient } from '@prisma/client'
import { channelIdentityKey } from '../src/lib/server/iptv'

const db = new PrismaClient()
const BATCH = 1000

async function main() {
  const total = await db.channel.count({ where: { identityKey: null } })
  console.log(`Channels needing identityKey: ${total}`)
  if (total === 0) {
    console.log('Nothing to backfill.')
    return
  }

  let done = 0
  // Keep pulling the next slice of un-keyed rows (the WHERE shrinks as we write).
  for (;;) {
    const rows = await db.channel.findMany({
      where: { identityKey: null },
      select: { id: true, name: true },
      take: BATCH,
    })
    if (rows.length === 0) break

    // Group ids by the computed key so identical channels update in one statement.
    const byKey = new Map<string, string[]>()
    for (const row of rows) {
      const key = channelIdentityKey(row.name) || row.name.toLowerCase().trim()
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(row.id)
    }

    await db.$transaction(
      [...byKey.entries()].map(([key, ids]) =>
        db.channel.updateMany({ where: { id: { in: ids } }, data: { identityKey: key } })
      )
    )

    done += rows.length
    console.log(`  ${done}/${total}`)
  }

  console.log('Backfill complete.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
