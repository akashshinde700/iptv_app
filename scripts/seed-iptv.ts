/**
 * Seed script: imports iptv-org data (https://github.com/iptv-org/iptv)
 * from JSON files in scripts/iptv/ into the database for ONE organization.
 *
 * Run: bun scripts/seed-iptv.ts            (defaults to the root org)
 *      ORG_SLUG=acme bun scripts/seed-iptv.ts
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import path from 'path'
import { regionForCountry } from '../src/lib/server/regions'

const db = new PrismaClient()
const DATA_DIR = path.join(__dirname, 'iptv')
const ORG_SLUG = process.env.ORG_SLUG ?? process.env.ROOT_ORG_SLUG ?? 'root'

interface RawChannel {
  id: string
  name: string
  alt_names: string[]
  network: string | null
  owners: string[]
  country: string | null
  categories: string[]
  is_nsfw: boolean
  launched: string | null
  closed: string | null
  replaced_by: string | null
  website: string | null
  logo?: string | null
}
interface RawStream {
  channel: string | null
  feed: string | null
  title: string | null
  url: string
  quality: string | null
  label: string | null
  user_agent: string | null
  referrer: string | null
}
interface RawFeed {
  channel: string
  id: string
  name: string
  languages: string[]
}
interface RawCountry { name: string; code: string; flag: string }
interface RawLanguage { code: string; name: string }
interface RawLogo {
  channel: string
  feed: string | null
  in_use: boolean
  width: number
  format: string
  url: string
}

function load<T>(file: string): T[] {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T[]
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  const org = await db.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: { slug: ORG_SLUG, name: ORG_SLUG === 'root' ? 'StreamKaro' : ORG_SLUG, status: 'ACTIVE' },
  })
  console.log(`Seeding into organization "${org.slug}" (${org.id})`)

  console.log('Loading JSON data...')
  const channels = load<RawChannel>('channels.json')
  const streams = load<RawStream>('streams.json')
  const feeds = load<RawFeed>('feeds.json')
  const countries = load<RawCountry>('countries.json')
  const languages = load<RawLanguage>('languages.json')
  const logos = load<RawLogo>('logos.json')

  const countryMap = new Map(countries.map(c => [c.code, c]))
  const langMap = new Map(languages.map(l => [l.code, l.name]))

  // channel -> union of feed language display names
  const channelLangSets = new Map<string, Set<string>>()
  for (const f of feeds) {
    if (!f.channel || !Array.isArray(f.languages)) continue
    const set = channelLangSets.get(f.channel) ?? new Set<string>()
    for (const code of f.languages) {
      const name = langMap.get(code)
      if (name) set.add(name)
    }
    channelLangSets.set(f.channel, set)
  }

  // best logo per channel: prefer in_use + PNG + largest width, feed-independent first
  const logoMap = new Map<string, string>()
  const logoScore = (l: RawLogo) =>
    (l.in_use ? 100000 : 0) + (l.feed === null ? 50000 : 0) + (l.format === 'PNG' ? 20000 : 0) + l.width
  for (const l of logos) {
    if (!l.channel || !l.url) continue
    const current = logoMap.get(l.channel)
    if (!current || logoScore(l) > logoScoreCache.get(l.channel)!) {
      logoMap.set(l.channel, l.url)
      logoScoreCache.set(l.channel, logoScore(l))
    }
  }

  // channels that have at least one valid, attached stream
  const validChannelIds = new Set(
    streams.filter(s => s.channel && s.url).map(s => s.channel as string)
  )

  console.log('Building channel records...')
  type ChannelRow = {
    sourceId: string; name: string; network: string | null; logo: string | null
    country: string | null; countryName: string | null; countryFlag: string | null
    region: string | null
    categories: string; languages: string; website: string | null; isNsfw: boolean
  }
  const channelRows: ChannelRow[] = []
  const internalIdMap = new Map<string, string>() // sourceId -> cuid (filled after insert)

  for (const c of channels) {
    if (c.closed) continue // skip closed channels
    if (!validChannelIds.has(c.id)) continue // no playable stream -> skip
    const country = c.country ? countryMap.get(c.country) : undefined
    const cats = c.categories ?? []
    const langs = [...(channelLangSets.get(c.id) ?? new Set<string>())]
    channelRows.push({
      sourceId: c.id,
      name: c.name,
      network: c.network ?? null,
      logo: logoMap.get(c.id) ?? null,
      country: c.country ?? null,
      countryName: country?.name ?? null,
      countryFlag: country?.flag ?? null,
      region: regionForCountry(c.country ?? null),
      categories: cats.length ? `|${cats.join('|')}|` : '|',
      languages: langs.length ? `|${langs.join('|')}|` : '|',
      website: c.website ?? null,
      isNsfw: !!c.is_nsfw,
    })
  }

  console.log(`Inserting ${channelRows.length} channels...`)
  // Only wipe THIS org's iptv-org catalog (portal channels + other tenants untouched).
  await db.stream.deleteMany({ where: { channel: { organizationId: org.id, portalId: null } } })
  await db.channel.deleteMany({ where: { organizationId: org.id, portalId: null } })
  for (const batch of chunk(channelRows, 500)) {
    await db.channel.createMany({ data: batch.map((c) => ({ ...c, organizationId: org.id })) })
  }

  // map sourceId -> internal id
  const inserted = await db.channel.findMany({ where: { organizationId: org.id }, select: { id: true, sourceId: true } })
  for (const ch of inserted) internalIdMap.set(ch.sourceId, ch.id)
  console.log(`Inserted channels: ${inserted.length}`)

  // build stream rows
  const feedName = new Map<string, string>()
  for (const f of feeds) feedName.set(`${f.channel}/${f.id}`, f.name)

  console.log('Building stream rows...')
  type StreamRow = {
    channelId: string; title: string | null; url: string
    quality: string | null; referrer: string | null; userAgent: string | null
  }
  const seen = new Set<string>()
  const streamRows: StreamRow[] = []
  for (const s of streams) {
    if (!s.channel || !s.url) continue
    const internalId = internalIdMap.get(s.channel)
    if (!internalId) continue
    const key = `${s.channel}::${s.url}`
    if (seen.has(key)) continue
    seen.add(key)
    const feedTitle = s.feed ? feedName.get(`${s.channel}/${s.feed}`) ?? null : null
    streamRows.push({
      channelId: internalId,
      title: s.title ?? feedTitle ?? s.label ?? null,
      url: s.url,
      quality: s.quality ?? null,
      referrer: s.referrer ?? null,
      userAgent: s.user_agent ?? null,
    })
  }

  console.log(`Inserting ${streamRows.length} streams...`)
  for (const batch of chunk(streamRows, 500)) {
    await db.stream.createMany({ data: batch })
  }

  const [totalChannels, totalStreams, nsfw] = await Promise.all([
    db.channel.count(),
    db.stream.count(),
    db.channel.count({ where: { isNsfw: true } }),
  ])
  console.log('--- DONE ---')
  console.log(`Channels: ${totalChannels} (nsfw: ${nsfw})`)
  console.log(`Streams:  ${totalStreams}`)
}

// logoScore helper map (module scope to be reachable in main)
const logoScoreCache = new Map<string, number>()

main()
  .catch(err => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
