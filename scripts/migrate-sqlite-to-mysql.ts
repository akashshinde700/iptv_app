/**
 * One-time migration: copy every row from the legacy SQLite database
 * (db/custom.db) into the MySQL database configured in DATABASE_URL.
 *
 *   bun scripts/migrate-sqlite-to-mysql.ts
 *
 * Safe to re-run: each table is cleared before it is re-filled.
 */
import { Database } from 'bun:sqlite'
import { PrismaClient } from '@prisma/client'

const SQLITE_PATH = process.env.LEGACY_SQLITE ?? 'db/custom.db'
const CHUNK = 500

const sqlite = new Database(SQLITE_PATH, { readonly: true })
const db = new PrismaClient()

const rows = <T = any>(table: string): T[] => sqlite.query(`SELECT * FROM "${table}"`).all() as T[]
const bool = (v: any) => v === 1 || v === true || v === '1'
const date = (v: any) => (v == null ? null : new Date(typeof v === 'number' ? v : String(v)))

async function chunked<T>(items: T[], fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += CHUNK) await fn(items.slice(i, i + CHUNK))
}

async function main() {
  console.log(`Reading legacy SQLite at ${SQLITE_PATH}`)

  // Clear in FK-safe order.
  await db.auditLog.deleteMany()
  await db.customerOverride.deleteMany()
  await db.customerSession.deleteMany()
  await db.adminSession.deleteMany()
  await db.syncLog.deleteMany()
  await db.stream.deleteMany()
  await db.channel.deleteMany()
  await db.customer.deleteMany()
  await db.plan.deleteMany()
  await db.portal.deleteMany()
  await db.admin.deleteMany()

  const admins = rows('Admin')
  await db.admin.createMany({
    data: admins.map((a: any) => ({
      id: a.id, username: a.username, email: a.email, passwordHash: a.passwordHash,
      role: a.role, isActive: bool(a.isActive), createdAt: date(a.createdAt)!, updatedAt: date(a.updatedAt)!,
    })),
  })
  console.log(`admins: ${admins.length}`)

  const plans = rows('Plan')
  await db.plan.createMany({
    data: plans.map((p: any) => ({
      id: p.id, name: p.name, description: p.description, price: p.price, durationDays: p.durationDays,
      isActive: bool(p.isActive), allowAdult: bool(p.allowAdult), maxDevices: p.maxDevices ?? 1,
      regions: p.regions ?? '|', countries: p.countries ?? '|', languages: p.languages ?? '|', categories: p.categories ?? '|',
      validFrom: date(p.validFrom), validTo: date(p.validTo), createdAt: date(p.createdAt)!, updatedAt: date(p.updatedAt)!,
    })),
  })
  console.log(`plans: ${plans.length}`)

  const portals = rows('Portal')
  await db.portal.createMany({
    data: portals.map((p: any) => ({
      id: p.id, name: p.name, type: p.type, url: p.url, macAddress: p.macAddress,
      username: p.username, password: p.password, epgUrl: p.epgUrl, status: p.status, lastError: p.lastError,
      lastSyncedAt: date(p.lastSyncedAt), expiresAt: date(p.expiresAt), notes: p.notes, isActive: bool(p.isActive),
      fileData: p.fileData, createdAt: date(p.createdAt)!, updatedAt: date(p.updatedAt)!,
    })),
  })
  console.log(`portals: ${portals.length}`)

  const channels = rows('Channel')
  await chunked(channels, (batch) =>
    db.channel.createMany({
      data: batch.map((c: any) => ({
        id: c.id, sourceId: c.sourceId, name: c.name, network: c.network, logo: c.logo,
        country: c.country, countryName: c.countryName, countryFlag: c.countryFlag, region: c.region,
        categories: c.categories ?? '|', languages: c.languages ?? '|', website: c.website,
        isNsfw: bool(c.isNsfw), isActive: bool(c.isActive), isDemo: bool(c.isDemo), portalId: c.portalId,
      })),
    }),
  )
  console.log(`channels: ${channels.length}`)

  const streams = rows('Stream')
  await chunked(streams, (batch) =>
    db.stream.createMany({
      data: batch.map((s: any) => ({
        id: s.id, channelId: s.channelId, title: s.title, url: s.url,
        quality: s.quality, referrer: s.referrer, userAgent: s.userAgent,
      })),
    }),
  )
  console.log(`streams: ${streams.length}`)

  const customers = rows('Customer')
  await db.customer.createMany({
    data: customers.map((c: any) => ({
      id: c.id, name: c.name, username: c.username, email: c.email, passwordHash: c.passwordHash,
      mobile: c.mobile, status: c.status, planId: c.planId, planStartedAt: date(c.planStartedAt),
      planExpiresAt: date(c.planExpiresAt), notes: c.notes, lastLoginAt: date(c.lastLoginAt),
      createdAt: date(c.createdAt)!, updatedAt: date(c.updatedAt)!,
    })),
  })
  console.log(`customers: ${customers.length}`)

  const overrides = rows('CustomerOverride')
  if (overrides.length)
    await db.customerOverride.createMany({
      data: overrides.map((o: any) => ({
        id: o.id, customerId: o.customerId, channelId: o.channelId, allow: bool(o.allow), createdAt: date(o.createdAt)!,
      })),
    })
  console.log(`overrides: ${overrides.length}`)

  const syncLogs = rows('SyncLog')
  if (syncLogs.length)
    await db.syncLog.createMany({
      data: syncLogs.map((l: any) => ({
        id: l.id, portalId: l.portalId, startedAt: date(l.startedAt)!, finishedAt: date(l.finishedAt),
        added: l.added ?? 0, removed: l.removed ?? 0, updated: l.updated ?? 0, status: l.status, message: l.message,
      })),
    })
  console.log(`syncLogs: ${syncLogs.length}`)

  // sessions + audit logs are transient — skip by default (set MIGRATE_SESSIONS=1 to include)
  if (process.env.MIGRATE_SESSIONS === '1') {
    const as = rows('AdminSession')
    await db.adminSession.createMany({ data: as.map((s: any) => ({ id: s.id, token: s.token, adminId: s.adminId, expiresAt: date(s.expiresAt)!, ip: s.ip, userAgent: s.userAgent, createdAt: date(s.createdAt)! })) })
    const cs = rows('CustomerSession')
    await db.customerSession.createMany({ data: cs.map((s: any) => ({ id: s.id, token: s.token, customerId: s.customerId, expiresAt: date(s.expiresAt)!, ip: s.ip, userAgent: s.userAgent, createdAt: date(s.createdAt)! })) })
    console.log(`sessions: ${as.length} admin / ${cs.length} customer`)
  }

  console.log('\nDone. Verify with:  npx prisma studio')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
