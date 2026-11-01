/**
 * One-time: encrypt any plaintext Portal.password values in place.
 *   bun scripts/encrypt-portal-secrets.ts
 * Safe to re-run — already-encrypted values (enc:v1:) are skipped.
 */
import { PrismaClient } from '@prisma/client'
import { encryptSecret } from '../src/lib/server/crypto'

const db = new PrismaClient()

async function main() {
  const portals = await db.portal.findMany({
    where: { password: { not: null } },
    select: { id: true, password: true },
  })
  let changed = 0
  for (const p of portals) {
    if (!p.password || p.password.startsWith('enc:v1:')) continue
    await db.portal.update({ where: { id: p.id }, data: { password: encryptSecret(p.password) } })
    changed++
  }
  console.log(`encrypted ${changed} / ${portals.length} portal passwords`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
