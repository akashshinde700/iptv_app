/**
 * Create the root Organization and attach every existing row to it.
 *   bun scripts/backfill-org.ts
 * Idempotent.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const ROOT_SLUG = process.env.ROOT_ORG_SLUG ?? 'root'

async function main() {
  const root = await db.organization.upsert({
    where: { slug: ROOT_SLUG },
    update: {},
    create: {
      slug: ROOT_SLUG,
      name: 'StreamKaro',
      status: 'ACTIVE',
      platformPlan: 'SCALE',
    },
  })
  console.log(`root org: ${root.id} (${root.slug})`)

  const r1 = await db.channel.updateMany({ where: { organizationId: null }, data: { organizationId: root.id } })
  const r2 = await db.portal.updateMany({ where: { organizationId: null }, data: { organizationId: root.id } })
  const r3 = await db.plan.updateMany({ where: { organizationId: null }, data: { organizationId: root.id } })
  const r4 = await db.customer.updateMany({ where: { organizationId: null }, data: { organizationId: root.id } })
  const r5 = await db.admin.updateMany({ where: { organizationId: null }, data: { organizationId: root.id, isPlatformStaff: true } })
  const r6 = await db.auditLog.updateMany({ where: { organizationId: null }, data: { organizationId: root.id } })

  console.log(`channels ${r1.count} | portals ${r2.count} | plans ${r3.count} | customers ${r4.count} | admins ${r5.count} | auditLogs ${r6.count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
