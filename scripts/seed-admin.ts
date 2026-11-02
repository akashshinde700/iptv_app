/**
 * Seed: default admin, test customer, test plan. Safe to re-run (upserts by unique keys).
 *
 * SECURITY (SEC-01)
 * -----------------
 * This script used to hardcode `admin / StreamKaro@2024`, print it to stdout, and the same
 * credential was printed on the product's own login screen — so every deployment that ran the
 * seed shared one publicly known owner password.
 *
 * Now:
 *   - the owner password comes from `ADMIN_PASSWORD` (or `SEED_ADMIN_PASSWORD`);
 *   - when it is unset, a strong random password is generated **once** and printed, so the
 *     operator can copy it into their password manager;
 *   - production refuses to seed a weak/default password at all.
 *
 * Admin login:  admin / $ADMIN_PASSWORD          (default: auto-generated, printed once)
 * Test login:   testuser / $SEED_CUSTOMER_PASSWORD (skipped in production)
 */
import { randomBytes } from 'node:crypto'
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/server/auth'
import { isLegacyDefaultPassword, passwordProblem } from '../src/lib/server/password-rules'

const ROOT_SLUG = process.env.ROOT_ORG_SLUG ?? 'root'
const IS_PROD = process.env.NODE_ENV === 'production'

function generatePassword(): string {
  // 24 chars of base64url ≈ 144 bits of entropy: safe to paste, no ambiguity about strength.
  return randomBytes(18).toString('base64url')
}

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
    const provided = process.env.ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD
    const problem = provided ? passwordProblem(provided) : null

    if (provided && (problem || isLegacyDefaultPassword(provided))) {
      if (IS_PROD) {
        throw new Error(
          `Refusing to seed a weak ADMIN_PASSWORD in production: ${problem ?? 'known default password'}`,
        )
      }
      console.warn(`⚠ ADMIN_PASSWORD is weak (${problem ?? 'known default password'}) — dev only`)
    }

    const password = provided && !IS_PROD ? provided : provided && !problem ? provided : generatePassword()
    admin = await db.admin.create({
      data: {
        organizationId: org.id,
        isPlatformStaff: true,
        username: 'admin',
        email: process.env.ADMIN_EMAIL ?? 'admin@streamkaro.app',
        passwordHash: hashPassword(password),
        role: 'OWNER',
        isActive: true,
      },
    })
    if (!provided || IS_PROD) {
      console.log('✔ Admin ready: admin /', password)
      console.log('  ↳ Change it after the first login (Admin → Settings → Change password).')
    } else {
      console.log('✔ Admin ready: admin / (password from ADMIN_PASSWORD)')
    }
  } else {
    console.log('✔ Admin already exists:', admin.username, '(password unchanged)')
  }

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

  // 3) Test customer — a demo login must never exist in a production database.
  if (IS_PROD && process.env.SEED_TEST_CUSTOMER !== '1') {
    console.log('ℹ Skipping demo customer in production (set SEED_TEST_CUSTOMER=1 to force)')
    return
  }

  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? 'test1234'
  const customer = await db.customer.upsert({
    where: { organizationId_username: { organizationId: org.id, username: 'testuser' } },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Test Customer',
      username: 'testuser',
      email: 'testuser@streamkaro.app',
      passwordHash: hashPassword(customerPassword),
      mobile: '9999999999',
      status: 'ACTIVE',
      planId: plan.id,
      planStartedAt: new Date(),
      planExpiresAt: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
      notes: 'Seeded test customer',
    },
  })
  console.log('✔ Customer ready:', customer.username, `/ ${customerPassword}`)
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
