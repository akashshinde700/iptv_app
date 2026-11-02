/* M3U / m3u_plus playlist parser with metadata extraction. */
import { guardedFetch } from '@/lib/server/net-guard'

export interface ParsedChannel {
  name: string
  url: string
  logo: string | null
  group: string | null
  tvgId: string | null
  tvgCountry: string | null
  language: string | null
  category: string | null
  country: string | null
  countryName: string | null
  quality: string | null
  isAdult: boolean
}

const ADULT_RE =
  /\b(xxx|adult|porn|18\+|18 plus|plus 18|erotic|playboy|brazzers|hustler|penthouse|dorcel|venus)\b/i

const LANGUAGE_KEYWORDS: Record<string, string> = {
  hindi: 'Hindi', english: 'English', tamil: 'Tamil', telugu: 'Telugu', malayalam: 'Malayalam',
  kannada: 'Kannada', bengali: 'Bengali', bangla: 'Bengali', punjabi: 'Punjabi', marathi: 'Marathi',
  gujarati: 'Gujarati', urdu: 'Urdu', arabic: 'Arabic', french: 'Français', spanish: 'Español',
  german: 'Deutsch', portuguese: 'Português', turkish: 'Turkish', russian: 'Russian',
  italian: 'Italiano', dutch: 'Dutch', nepali: 'Nepali', sinhala: 'Sinhala', odia: 'Odia',
  assamese: 'Assamese', kashmiri: 'Kashmiri', bhojpuri: 'Bhojpuri', thai: 'Thai', indonesian: 'Indonesian',
}

const CATEGORY_KEYWORDS: Record<string, string> = {
  news: 'news', sports: 'sports', sport: 'sports', cricket: 'sports', football: 'sports',
  movie: 'movies', movies: 'movies', cinema: 'movies', film: 'movies',
  entertainment: 'entertainment', kids: 'kids', cartoon: 'kids', children: 'kids',
  music: 'music', documentary: 'documentary', religious: 'religious', devotional: 'religious',
  islamic: 'religious', hindu: 'religious', gurbani: 'religious', spiritual: 'religious',
  series: 'series', lifestyle: 'lifestyle', food: 'food', travel: 'travel',
  education: 'education', business: 'business', weather: 'weather', science: 'science',
  comedy: 'comedy', animation: 'animation', classic: 'classic',
  culture: 'culture', family: 'family', general: 'general', legislative: 'legislative',
  outdoor: 'outdoor', relax: 'relax', shop: 'shop', xxx: 'xxx',
}

const COUNTRY_NAMES: Record<string, [string, string]> = {
  india: ['IN', 'India'], pakistan: ['PK', 'Pakistan'], bangladesh: ['BD', 'Bangladesh'],
  nepal: ['NP', 'Nepal'], 'sri lanka': ['LK', 'Sri Lanka'], afghanistan: ['AF', 'Afghanistan'],
  usa: ['US', 'United States'], 'united states': ['US', 'United States'], america: ['US', 'United States'],
  uk: ['GB', 'United Kingdom'], 'united kingdom': ['GB', 'United Kingdom'],
  canada: ['CA', 'Canada'], australia: ['AU', 'Australia'], uae: ['AE', 'United Arab Emirates'],
  'united arab emirates': ['AE', 'United Arab Emirates'], saudi: ['SA', 'Saudi Arabia'],
  'saudi arabia': ['SA', 'Saudi Arabia'], germany: ['DE', 'Germany'], france: ['FR', 'France'],
  spain: ['ES', 'Spain'], italy: ['IT', 'Italy'], netherlands: ['NL', 'Netherlands'],
  brazil: ['BR', 'Brazil'], portugal: ['PT', 'Portugal'], russia: ['RU', 'Russia'],
  turkey: ['TR', 'Turkey'], japan: ['JP', 'Japan'], china: ['CN', 'China'],
  korea: ['KR', 'South Korea'], malaysia: ['MY', 'Malaysia'], singapore: ['SG', 'Singapore'],
  indonesia: ['ID', 'Indonesia'], thailand: ['TH', 'Thailand'], philippines: ['PH', 'Philippines'],
  'south africa': ['ZA', 'South Africa'], nigeria: ['NG', 'Nigeria'], kenya: ['KE', 'Kenya'],
  egypt: ['EG', 'Egypt'], mexico: ['MX', 'Mexico'], argentina: ['AR', 'Argentina'],
  iran: ['IR', 'Iran'], iraq: ['IQ', 'Iraq'],
}

// Minimal lookup for the "IN:" / "US |" style 2-letter code path.
const CODE_LOOKUP: Record<string, string> = {
  IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', NP: 'Nepal', LK: 'Sri Lanka', AF: 'Afghanistan',
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', AE: 'United Arab Emirates',
  SA: 'Saudi Arabia', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
  BR: 'Brazil', PT: 'Portugal', RU: 'Russia', TR: 'Turkey', JP: 'Japan', CN: 'China',
  KR: 'South Korea', MY: 'Malaysia', SG: 'Singapore', ID: 'Indonesia', TH: 'Thailand',
  PH: 'Philippines', ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', EG: 'Egypt',
  MX: 'Mexico', AR: 'Argentina', IR: 'Iran', IQ: 'Iraq',
}

export function detectAdult(text: string): boolean {
  return ADULT_RE.test(text)
}

function detectLanguage(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [keyword, language] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(lower)) return language
  }
  return null
}

export function detectCategory(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(lower)) return category
  }
  return null
}

function detectCountry(text: string): { code: string; name: string } | null {
  // patterns like "IN:", "IND:", "IN |", "[IN]"
  const codeMatch = text.match(/^\s*(?:\[)?([A-Za-z]{2,3})(?:\])?\s*[:|]/)
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase()
    if (code.length === 2 && CODE_LOOKUP[code]) return { code, name: CODE_LOOKUP[code] }
    if (code === 'IND') return { code: 'IN', name: 'India' }
  }
  const lower = text.toLowerCase()
  for (const [keyword, entry] of Object.entries(COUNTRY_NAMES)) {
    if (lower.includes(keyword)) return { code: entry[0], name: entry[1] }
  }
  return null
}

export function detectQuality(name: string, url: string): string | null {
  const match = name.match(/\b(\d{3,4}p)\b/i)
  if (match) return match[1].toLowerCase()
  if (/\b4k\b|2160p/i.test(name)) return '2160p'
  if (/\b(f?hd|1080)\b/i.test(name)) return '1080p'
  if (/\bhd\b/i.test(name)) return '720p'
  if (/\bsd\b/i.test(name)) return '480p'
  if (url.includes('.m3u8')) return 'HLS'
  return null
}

function parseExtinfAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRe = /([A-Za-z0-9_-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(raw))) {
    attrs[match[1].toLowerCase()] = match[2]
  }
  return attrs
}

/** Parse a full M3U playlist string into channel entries. */
export function parseM3U(content: string): ParsedChannel[] {
  const lines = content.split(/\r?\n/)
  const channels: ParsedChannel[] = []

  let pending: { attrs: Record<string, string>; title: string } | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('#EXTINF')) {
      const colonIdx = line.indexOf(':')
      const body = colonIdx >= 0 ? line.slice(colonIdx + 1) : ''
      const commaIdx = body.lastIndexOf(',')
      const attrPart = commaIdx >= 0 ? body.slice(0, commaIdx) : body
      const title = commaIdx >= 0 ? body.slice(commaIdx + 1).trim() : ''
      pending = { attrs: parseExtinfAttributes(attrPart), title }
      continue
    }

    if (line.startsWith('#')) continue // EXTVLCOPT / EXTGRP / comments

    // First non-comment line after EXTINF is the stream URL.
    if (pending) {
      const { attrs, title } = pending
      pending = null
      if (!/^https?:\/\//i.test(line)) continue

      const group = attrs['group-title'] || attrs['group'] || null
      const haystack = `${title} ${group ?? ''}`
      const countryInfo = detectCountry(haystack)

      channels.push({
        name: title || attrs['tvg-name'] || 'Unknown Channel',
        url: line,
        logo: attrs['tvg-logo'] || attrs['logo'] || null,
        group,
        tvgId: attrs['tvg-id'] || null,
        tvgCountry: attrs['tvg-country'] || null,
        language: attrs['tvg-language'] || detectLanguage(haystack),
        category: detectCategory(haystack),
        country: countryInfo?.code ?? (attrs['tvg-country'] ? attrs['tvg-country'].split(';')[0] : null),
        countryName: countryInfo?.name ?? null,
        quality: detectQuality(title, line),
        isAdult: detectAdult(haystack),
      })
    }
  }

  return channels
}

/**
 * Fetch a playlist URL with a timeout. Kept comfortably under the sync route's budget so a
 * dead / hanging source fails with a CLEAR message instead of a gateway 502 two minutes later.
 * Many public M3U links go up and down, so the message must point at the source, not the app.
 */
export async function fetchPlaylist(url: string, timeoutMs = 60_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response: Response
    try {
      response = await guardedFetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' },
      })
    } catch (err) {
      // AbortError (our timeout) or a network failure — the source is unreachable, not us.
      if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
        throw new Error(`Source ne ${Math.round(timeoutMs / 1000)}s me response nahi diya — server down ya bahut slow hai. URL check karo ya thodi der baad try karo.`)
      }
      throw new Error('Source reachable nahi hai — URL galat ho sakta hai ya server abhi down hai.')
    }
    if (!response.ok) {
      throw new Error(`Source ne HTTP ${response.status} diya — URL ya credentials check karo.`)
    }
    try {
      return await response.text()
    } catch {
      throw new Error('Source se playlist download hote waqt connection toot gaya — server slow/unstable hai.')
    }
  } finally {
    clearTimeout(timer)
  }
}
