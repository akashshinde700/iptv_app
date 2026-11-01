/**
 * One-off backfill: derive Channel.region from Channel.country for every
 * channel that does not have a region yet. Safe to re-run.
 */
import { db } from '../src/lib/db'
import { regionForCountry } from '../src/lib/server/regions'

async function backfill() {
  const channels = await db.channel.findMany({
    where: { region: null, country: { not: null } },
    select: { id: true, country: true },
  })

  let updated = 0
  for (const channel of channels) {
    const region = regionForCountry(channel.country)
    if (region) {
      await db.channel.update({ where: { id: channel.id }, data: { region } })
      updated++
    }
  }
  console.log(`Backfilled region for ${updated}/${channels.length} channels`)
}

backfill()
  .catch((error) => {
    console.error('Backfill failed:', error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
