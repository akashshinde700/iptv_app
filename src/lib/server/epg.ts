/**
 * EPG (XMLTV) guide for the Live TV side.
 *
 * Each Portal can carry an `epgUrl`. We download it, parse `<channel>` + `<programme>`
 * entries, and match them to our channels in this order:
 *   1. XMLTV channel id === Channel.sourceId   (source ids are the panel's own ids)
 *   2. normalised display-name === normalised Channel.name
 *   3. same name with the country/suffix noise stripped (see `channelIdentityKey`)
 *
 * The XMLTV file for a country is usually 5–40 MB, so:
 *   • the download+parse result is cached in memory per URL for GUIDE_TTL_MS,
 *   • only a window around "now" is kept (a guide with 7 days of history is useless),
 *   • failures degrade to "no guide" — never to a 500 on the channel page.
 */
import { db } from '@/lib/db'
import { channelIdentityKey } from '@/lib/server/iptv'
import { guardedFetch } from '@/lib/server/net-guard'

const GUIDE_TTL_MS = 15 * 60 * 1000
/** Keep a day of history + two days ahead; that's what a TV guide actually shows. */
const WINDOW_BEFORE_MS = 6 * 60 * 60 * 1000
const WINDOW_AFTER_MS = 48 * 60 * 60 * 1000
const MAX_GUIDE_BYTES = 64 * 1024 * 1024
const FETCH_TIMEOUT_MS = 25_000

export interface GuideProgramme {
  title: string
  description: string | null
  start: number
  stop: number
  category: string | null
}

interface ParsedGuide {
  fetchedAt: number
  /** xmltv channel id → display names */
  channelNames: Map<string, string[]>
  /** xmltv channel id → programmes sorted by start */
  programmes: Map<string, GuideProgramme[]>
  /** normalised display name → xmltv channel id */
  byDisplayName: Map<string, string>
}

const guideCache = new Map<string, ParsedGuide | null>()

/** XMLTV timestamps look like `20261101193000 +0530`. */
function parseXmltvTime(value: string | null): number | null {
  if (!value) return null
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(value.trim())
  if (!match) return null
  const [, y, mo, d, h, mi, s, tz] = match
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}`
  const offset = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : 'Z'
  const time = Date.parse(`${iso}${offset}`)
  return Number.isFinite(time) ? time : null
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

function tag(block: string, name: string): string | null {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block)
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, '').trim()) : null
}

function attr(block: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(block)
  return match ? decodeEntities(match[1]) : null
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(hd|fhd|uhd|sd|4k|plus|channel|tv)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse a whole XMLTV document into the caches above. Exported for tests. */
export function parseXmltv(xml: string, now = Date.now()): {
  channelNames: Map<string, string[]>
  programmes: Map<string, GuideProgramme[]>
  byDisplayName: Map<string, string>
} {
  const channelNames = new Map<string, string[]>()
  const byDisplayName = new Map<string, string>()
  const programmes = new Map<string, GuideProgramme[]>()

  for (const match of xml.matchAll(/<channel\b[^>]*>[\s\S]*?<\/channel>/gi)) {
    const block = match[0]
    const id = attr(block, 'id')
    if (!id) continue
    const names = [...block.matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/gi)].map((m) =>
      decodeEntities(m[1].trim()),
    )
    channelNames.set(id, names)
    for (const name of names) {
      const key = normaliseName(name)
      if (key && !byDisplayName.has(key)) byDisplayName.set(key, id)
    }
  }

  const minStart = now - WINDOW_BEFORE_MS
  const maxStart = now + WINDOW_AFTER_MS

  for (const match of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) {
    const head = match[1]
    const body = match[2]
    const channelId = attr(head, 'channel')
    const start = parseXmltvTime(attr(head, 'start'))
    const stop = parseXmltvTime(attr(head, 'stop'))
    if (!channelId || start === null) continue
    if (start < minStart || start > maxStart) continue
    const entry: GuideProgramme = {
      title: tag(body, 'title') ?? 'Untitled',
      description: tag(body, 'desc'),
      start,
      stop: stop ?? start + 30 * 60 * 1000,
      category: tag(body, 'category'),
    }
    const list = programmes.get(channelId)
    if (list) list.push(entry)
    else programmes.set(channelId, [entry])
  }

  for (const list of programmes.values()) list.sort((a, b) => a.start - b.start)
  return { channelNames, programmes, byDisplayName }
}

async function loadGuide(url: string, now: number): Promise<ParsedGuide | null> {
  const cached = guideCache.get(url)
  if (cached !== undefined && (cached === null ? false : now - cached.fetchedAt < GUIDE_TTL_MS)) return cached

  try {
    const res = await guardedFetch(url, {
      // Some providers 403 a bare fetch; a plain UA is enough for most.
      headers: { 'user-agent': 'StreamKaro/1.0 EPG', accept: 'application/xml,text/xml,*/*' },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      guideCache.set(url, null)
      return null
    }
    const length = Number(res.headers.get('content-length') ?? '0')
    if (length > MAX_GUIDE_BYTES) {
      guideCache.set(url, null)
      return null
    }
    const xml = await res.text()
    if (xml.length > MAX_GUIDE_BYTES) {
      guideCache.set(url, null)
      return null
    }
    const parsed: ParsedGuide = { fetchedAt: now, ...parseXmltv(xml, now) }
    guideCache.set(url, parsed)
    return parsed
  } catch {
    guideCache.set(url, null)
    return null
  }
}

export interface ChannelGuide {
  channelId: string
  matched: boolean
  now: (GuideProgramme & { progress: number }) | null
  next: GuideProgramme | null
}

/**
 * Now/next for a set of channels, matching each channel against every guide URL the
 * organization's sources provide. Result is keyed by our Channel.id.
 */
export async function guideForChannels(
  organizationId: string,
  channels: { id: string; name: string; sourceId: string }[],
): Promise<ChannelGuide[]> {
  if (channels.length === 0) return []
  const portals = await db.portal.findMany({
    where: { organizationId, epgUrl: { not: null }, isActive: true },
    select: { epgUrl: true },
    take: 8,
  })
  const urls = [...new Set(portals.map((p) => p.epgUrl).filter((u): u is string => !!u))]
  if (urls.length === 0) return []

  const now = Date.now()
  const guides = (await Promise.all(urls.map((url) => loadGuide(url, now)))).filter(
    (g): g is ParsedGuide => g !== null,
  )
  if (guides.length === 0) return channels.map((c) => ({ channelId: c.id, matched: false, now: null, next: null }))

  return channels.map((channel) => {
    const xmlId = resolveXmltvId(channel, guides)
    if (!xmlId) return { channelId: channel.id, matched: false, now: null, next: null }

    const programmes = guides.flatMap((g) => g.programmes.get(xmlId) ?? [])
    if (programmes.length === 0) return { channelId: channel.id, matched: false, now: null, next: null }

    programmes.sort((a, b) => a.start - b.start)
    const current = programmes.find((p) => p.start <= now && p.stop > now) ?? null
    const upcoming = programmes.find((p) => p.start > now) ?? null
    return {
      channelId: channel.id,
      matched: true,
      now: current
        ? { ...current, progress: Math.min(1, Math.max(0, (now - current.start) / Math.max(1, current.stop - current.start))) }
        : null,
      next: upcoming,
    }
  })
}

function resolveXmltvId(
  channel: { name: string; sourceId: string },
  guides: ParsedGuide[],
): string | null {
  // 1) our source id is often the panel's epg id
  for (const guide of guides) if (guide.programmes.has(channel.sourceId)) return channel.sourceId
  // 2) exact display-name match
  const nameKey = normaliseName(channel.name)
  for (const guide of guides) {
    const id = guide.byDisplayName.get(nameKey)
    if (id) return id
  }
  // 3) identity-key match (drops "HD", country prefixes, bracketed notes)
  const identity = channelIdentityKey(channel.name)
  for (const guide of guides) {
    for (const [xmlId, names] of guide.channelNames) {
      if (names.some((n) => channelIdentityKey(n) === identity)) return xmlId
    }
  }
  return null
}

/** Exposed for the admin UI "test this EPG URL" action and for tests. */
export async function previewGuide(url: string, limit = 5) {
  const guide = await loadGuide(url, Date.now())
  if (!guide) return null
  const first = [...guide.programmes.entries()]
    .filter(([, list]) => list.length > 0)
    .slice(0, limit)
    .map(([channelId, list]) => ({
      channelId,
      names: guide.channelNames.get(channelId) ?? [],
      programmes: list.slice(0, 3),
    }))
  return { channels: guide.programmes.size, sample: first }
}
