/**
 * Delete expired admin + customer sessions. Cron this (e.g. hourly):
 *   bun scripts/sweep-sessions.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const now = new Date()
  const [a, c] = await Promise.all([
    db.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.customerSession.deleteMany({ where: { expiresAt: { lt: now } } }),
  ])
  console.log(`swept ${a.count} admin + ${c.count} customer expired sessions`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
