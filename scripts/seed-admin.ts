/**
 * Seed: default admin, test customer, test plan.
 * Safe to re-run (upserts by unique keys).
 *
 * Admin login:  admin / StreamKaro@2024
 * Test login:   testuser / test1234
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/server/auth'

const ROOT_SLUG = process.env.ROOT_ORG_SLUG ?? 'root'

async function main() {
  // 0) Root organization (the default single-operator tenant)
  const org = await db.organization.upsert({
    where: { slug: ROOT_SLUG },
    update: {},
    create: { slug: ROOT_SLUG, name: 'StreamKaro', status: 'ACTIVE', platformPlan: 'SCALE' },
  })
  console.log('✔ Org ready:', org.slug)

  // 1) Owner admin (also platform staff for the root org)
  let admin = await db.admin.findFirst({ where: { organizationId: org.id, username: 'admin' } })
  if (!admin) {
    admin = await db.admin.create({
      data: {
        organizationId: org.id,
        isPlatformStaff: true,
        username: 'admin',
        email: 'admin@streamkaro.app',
        passwordHash: hashPassword('StreamKaro@2024'),
        role: 'OWNER',
        isActive: true,
      },
    })
  }
  console.log('✔ Admin ready:', admin.username, '/ StreamKaro@2024')

  // 2) Premium Test plan — Asia → India → Hindi+Marathi+English, Adult OFF
  let plan = await db.plan.findFirst({ where: { name: 'Premium Test', organizationId: org.id } })
  if (!plan) {
    plan = await db.plan.create({
      data: {
        organizationId: org.id,
        name: 'Premium Test',
        description: 'Test plan: India channels in Hindi, Marathi & English. Adult content OFF.',
        price: 99,
        durationDays: 30,
        isActive: true,
        allowAdult: false,
        maxDevices: 2,
        regions: '|Asia|',
        countries: '|IN|',
        languages: '|Hindi|Marathi|English|',
        categories: '|', // all categories
      },
    })
  }
  console.log('✔ Plan ready:', plan.name, `₹${plan.price}/${plan.durationDays}d`)

  // 3) Test customer
  const customer = await db.customer.upsert({
    where: { organizationId_username: { organizationId: org.id, username: 'testuser' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Test Customer',
      username: 'testuser',
      email: 'testuser@streamkaro.app',
      passwordHash: hashPassword('test1234'),
      mobile: '9999999999',
      status: 'ACTIVE',
      planId: plan.id,
      planStartedAt: new Date(),
      planExpiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      notes: 'Seeded test customer',
    },
  })
  console.log('✔ Customer ready:', customer.username, '/ test1234')
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
