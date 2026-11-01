/**
 * Bulk import parser — turns messy credential dumps (Telegram/WhatsApp style)
 * into structured portal entries.
 *
 * Handles:
 *  - Xtream/M3U get.php links with username/password (+ "Expired on" blocks up to 15 lines after)
 *  - Stalker portal URLs followed by lists of MAC addresses (one portal entry per MAC)
 *  - Expiry dates in many formats:
 *      "September 7, 2025"  "April 1, 2026, 12:00 am"  "12.01.2027" (DD.MM.YYYY)
 *      "7/30/2027 9:54:42 AM" (M/D/YYYY)  "2026-12-11" (ISO)
 *  - Junk lines (download links, headers, emojis, promo) are skipped and counted.
 *
 * Pure functions only — no DB access here. Duplicate detection against the DB
 * happens in the API route via keyForEntry().
 */

export interface BulkEntry {
  type: 'STALKER' | 'XTREAM' | 'M3U_URL'
  name: string
  url: string | null
  macAddress: string | null
  username: string | null
  password: string | null
  expiresAt: Date | null
  expiryText: string | null
  sourceLine: number
}

export interface BulkParseResult {
  entries: BulkEntry[]
  skippedLines: number
  stats: { stalker: number; xtream: number; m3u: number }
}

const MAX_ENTRIES = 1000
const MAX_TEXT_LENGTH = 2_000_000

const MAC_RE = /\b([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})\b/
const GET_URL_RE = /https?:\/\/[^\s"'<>()[\]{}]+get\.php\?[^\s"'<>()[\]{}]*/i
const URL_RE = /https?:\/\/[^\s"'<>()[\]{}]+/i

// Links that are promo/file-host noise, not portals
const JUNK_URL_RE =
  /(mediafire|devuploads|mega\.nz|drive\.google|docs\.google|links\.|t\.me|telegram|discord|google\.|youtube|facebook|instagram|twitter|x\.com|wa\.me|whatsapp|play\.google|apple\.com|github\.com|niganpro|pastebin|\.apk\b|\.zip\b)/i

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

/** Parse the first date found in free text; supports the formats listed above. */
export function parseDateFromText(text: string): { date: Date; matched: string } | null {
  // Month name: "September 7, 2025" / "Apr 1 2026" / "April 1, 2026, 12:00 am"
  const m1 = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(\d{4})/i,
  )
  if (m1) {
    const key = m1[1].toLowerCase()
    const month = MONTHS[key.startsWith('sept') ? 'sep' : key.slice(0, 3)]
    const day = parseInt(m1[2], 10)
    const year = parseInt(m1[3], 10)
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      return { date: new Date(year, month - 1, day, 12, 0, 0), matched: m1[0] }
    }
  }

  // DD.MM.YYYY (European Telegram style: "12.01.2027")
  const m2 = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/)
  if (m2) {
    const day = parseInt(m2[1], 10)
    const month = parseInt(m2[2], 10)
    const year = parseInt(m2[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      return { date: new Date(year, month - 1, day, 12, 0, 0), matched: m2[0] }
    }
  }

  // M/D/YYYY (US style from Xtream dumps: "7/30/2027 9:54:42 AM")
  const m3 = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (m3) {
    const month = parseInt(m3[1], 10)
    const day = parseInt(m3[2], 10)
    const year = parseInt(m3[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      return { date: new Date(year, month - 1, day, 12, 0, 0), matched: m3[0] }
    }
  }

  // ISO: "2026-12-11"
  const m4 = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (m4) {
    const year = parseInt(m4[1], 10)
    const month = parseInt(m4[2], 10)
    const day = parseInt(m4[3], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      return { date: new Date(year, month - 1, day, 12, 0, 0), matched: m4[0] }
    }
  }

  return null
}

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/[.,;:)\]]+$/, '')
}

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0] || 'source'
  }
}

const NEW_BLOCK_RE = /NB\s*:|get\.php|🔗|📡|🛰/i

function looksLikeNewBlock(line: string): boolean {
  return NEW_BLOCK_RE.test(line) || MAC_RE.test(line) || URL_RE.test(line)
}

/** Look ahead up to `maxLines` for an expiry date (Xtream dump style).
 * Prefers lines labelled "Expired on", skips "Created on" lines. */
function findExpiryForward(lines: string[], startIdx: number, maxLines: number): { date: Date; matched: string } | null {
  let fallback: { date: Date; matched: string } | null = null
  for (let i = startIdx + 1; i < Math.min(startIdx + 1 + maxLines, lines.length); i++) {
    const line = lines[i]
    if (looksLikeNewBlock(line)) break
    if (/created/i.test(line)) continue // "Created on : 1/30/2025" — not an expiry
    const found = parseDateFromText(line)
    if (found) {
      if (/expir/i.test(line)) return found // labelled expiry wins immediately
      fallback ??= found
    }
  }
  return fallback
}

export function parseBulkText(text: string): BulkParseResult {
  const entries: BulkEntry[] = []
  let skippedLines = 0
  const stats = { stalker: 0, xtream: 0, m3u: 0 }

  if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH)
  const lines = text.split(/\r?\n/)

  // name dedup within the blob: host -> count
  const hostCount = new Map<string, number>()
  const nextName = (host: string): string => {
    const n = (hostCount.get(host) ?? 0) + 1
    hostCount.set(host, n)
    return n === 1 ? host : `${host} #${n}`
  }

  // de-dupe identical portal+MAC / portal+user pairs inside the blob
  const seenKeys = new Set<string>()

  // current stalker portal context for following MAC lines
  let currentPortal: string | null = null

  for (let i = 0; i < lines.length; i++) {
    if (entries.length >= MAX_ENTRIES) break
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) continue

    // ---- 1. get.php links (Xtream creds or plain M3U link) ----
    const getUrl = line.match(GET_URL_RE)
    if (getUrl) {
      const link = normalizeUrl(getUrl[0])
      let username: string | null = null
      let password: string | null = null
      try {
        const u = new URL(link)
        username = u.searchParams.get('username')
        password = u.searchParams.get('password')
      } catch {
        /* fallthrough */
      }

      if (username && password) {
        const base = (() => {
          try {
            return new URL(link).origin
          } catch {
            return hostOf(link)
          }
        })()
        const host = hostOf(base)
        const expiry = findExpiryForward(lines, i, 15)
        const key = `XTREAM|${base.toLowerCase()}|${username}`
        if (seenKeys.has(key)) {
          skippedLines++
          continue
        }
        seenKeys.add(key)
        entries.push({
          type: 'XTREAM',
          name: nextName(host),
          url: base,
          macAddress: null,
          username,
          password,
          expiresAt: expiry?.date ?? null,
          expiryText: expiry?.matched ?? null,
          sourceLine: i + 1,
        })
        stats.xtream++
      } else {
        const key = `M3U_URL|${link.toLowerCase()}`
        if (seenKeys.has(key)) {
          skippedLines++
          continue
        }
        seenKeys.add(key)
        const expiry = findExpiryForward(lines, i, 15)
        entries.push({
          type: 'M3U_URL',
          name: nextName(hostOf(link)),
          url: link,
          macAddress: null,
          username: null,
          password: null,
          expiresAt: expiry?.date ?? null,
          expiryText: expiry?.matched ?? null,
          sourceLine: i + 1,
        })
        stats.m3u++
      }
      continue
    }

    // ---- 2. Stalker portal URLs (any non-junk http link without get.php) ----
    const urlMatch = line.match(URL_RE)
    if (urlMatch && !JUNK_URL_RE.test(urlMatch[0])) {
      // store normalized portal URL as context for following MAC lines
      currentPortal = normalizeUrl(urlMatch[0])
      continue
    }

    // ---- 3. MAC lines -> one STALKER entry under the current portal ----
    const mac = line.match(MAC_RE)
    if (mac) {
      if (!currentPortal) {
        skippedLines++
        continue
      }
      const macAddress = mac[1].toUpperCase()
      // expiry on the same line after the MAC, else on the very next line
      const afterMac = line.slice((line.indexOf(mac[1]) ?? 0) + mac[1].length)
      let expiry = parseDateFromText(afterMac)
      let expiryText = expiry?.matched ?? null
      if (!expiry && i + 1 < lines.length) {
        const next = lines[i + 1]
        // next line is an expiry line if it has a date but no MAC/URL/get.php/created
        if (!MAC_RE.test(next) && !URL_RE.test(next) && !GET_URL_RE.test(next) && !/created/i.test(next)) {
          expiry = parseDateFromText(next)
          if (expiry) {
            expiryText = expiry.matched
            i++ // consume the next line
          }
        }
      }
      const key = `STALKER|${currentPortal.toLowerCase().replace(/\/+$/, '')}|${macAddress}`
      if (seenKeys.has(key)) {
        skippedLines++
        continue
      }
      seenKeys.add(key)
      entries.push({
        type: 'STALKER',
        name: nextName(hostOf(currentPortal)),
        url: currentPortal,
        macAddress,
        username: null,
        password: null,
        expiresAt: expiry?.date ?? null,
        expiryText,
        sourceLine: i + 1,
      })
      stats.stalker++
      continue
    }

    // ---- 4. anything else (headers, promo, user/pass notes without URL) ----
    skippedLines++
  }

  return { entries, skippedLines, stats }
}

/** Stable duplicate-detection key aligned with Portal DB fields. */
export function keyForEntry(e: {
  type: string
  url: string | null
  macAddress: string | null
  username: string | null
}): string {
  const url = (e.url ?? '').toLowerCase().replace(/\/+$/, '')
  return `${e.type}|${url}|${(e.macAddress ?? '').toUpperCase()}|${e.username ?? ''}`
}
