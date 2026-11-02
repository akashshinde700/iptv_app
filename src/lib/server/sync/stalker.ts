/**
 * Stalker Portal (STB middleware) client.
 *
 * Flow (classic MAG/STB emulator handshake):
 *   1. GET  {portal}server/load.php?type=stb&action=handshake   (Cookie: mac=...)
 *   2. Bearer token from response
 *   3. GET  {portal}server/load.php?type=itv&action=get_all_channels
 *
 * Portal URLs look like http://host/c/, http://host/stalker_portal/c/ or
 * http://host:port/c/ — the API path "server/load.php" is appended.
 */

import { createHash } from 'node:crypto'
import type { ParsedChannel } from './m3u'
import { guardedFetch } from '@/lib/server/net-guard'

export interface StalkerDevice {
  deviceId?: string | null
  deviceId2?: string | null
  serialNumber?: string | null
}

const sha256Upper = (s: string) => createHash('sha256').update(s).digest('hex').toUpperCase()
const sha1Upper = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase()
const md5 = (s: string) => createHash('md5').update(s).digest('hex')

// A real, accepted MAG250 firmware string — portals gate get_profile on this ("old firmware"
// otherwise). image_version pairs with it.
const MAG_FIRMWARE =
  'ImageDescription: 0.2.18-r23-250; ImageDate: Thu Sep 13 2018 12:23:34 GMT+0200; PORTAL version: 5.6.1; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c'

interface DeviceIdentity {
  sn: string
  deviceId: string
  deviceId2: string
}

/**
 * device_id candidates to try, in order. Most Ministra/Stalker portals bind a MAC to
 * device_id = SHA256(MAC) (the widely-used MAG default), so that's tried first; a legacy
 * SHA256(sn+mac) form is kept as a fallback for portals registered that way. An operator can
 * always paste the exact device_id/serial from TiViMate to override (tried first).
 */
function deviceIdentities(mac: string, device?: StalkerDevice): DeviceIdentity[] {
  const sn = device?.serialNumber?.trim() || md5(mac).slice(0, 13).toUpperCase()
  const list: DeviceIdentity[] = []
  if (device?.deviceId?.trim()) {
    const d = device.deviceId.trim()
    list.push({ sn, deviceId: d, deviceId2: device.deviceId2?.trim() || d })
  }
  list.push({ sn, deviceId: sha256Upper(mac), deviceId2: sha256Upper(mac) })
  list.push({ sn, deviceId: sha256Upper(sn + mac), deviceId2: sha256Upper(mac + sn) })
  return list
}

/** Full get_profile query for one device identity (real MAG box parameter set). */
function profileQuery(mac: string, id: DeviceIdentity): string {
  return new URLSearchParams({
    type: 'stb',
    action: 'get_profile',
    hd: '1',
    ver: MAG_FIRMWARE,
    num_banks: '2',
    sn: id.sn,
    stb_type: 'MAG250',
    client_type: 'STB',
    image_version: '218',
    video_out: 'hdmi',
    device_id: id.deviceId,
    device_id2: id.deviceId2,
    signature: sha256Upper(id.sn + mac),
    auth_second_step: '0',
    hw_version: '1.7-BD-00',
    not_valid_token: '0',
    metrics: JSON.stringify({ mac, sn: id.sn, model: 'MAG250', type: 'STB', uid: '' }),
    hw_version_2: sha1Upper(mac),
    api_signature: '262',
    JsHttpRequest: '1-xml',
  }).toString()
}

const STB_UA = 'Model: MAG250; Link: WiFi'
// Real MAG boxes send this full UA; some portals 403 anything else, so use it for User-Agent
// and keep the short "Model: …" string on X-User-Agent (what the middleware actually reads).
const FULL_UA =
  'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'

/** Strip trailing slashes and a trailing "/c" (the STB web-client folder, never part of the API). */
function stripToRoot(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/c$/i, '').replace(/\/+$/, '')
}

/**
 * Candidate API endpoints to try, in order. The Stalker/Ministra API lives at
 * `{portal-root}/server/load.php` — NOT under `/c/` (that's the JS client). Portal URLs
 * are entered in many shapes (…/c, …/stalker_portal/c, host root), so we probe the common
 * layouts and use whichever answers the handshake.
 */
function candidateApiBases(portalUrl: string): string[] {
  const root = stripToRoot(portalUrl)
  const bases: string[] = []
  const add = (b: string) => {
    if (!bases.includes(b)) bases.push(b)
  }
  add(`${root}/server/load.php`)
  if (!/\/stalker_portal$/i.test(root)) add(`${root}/stalker_portal/server/load.php`)
  add(`${root}/portal.php`)
  add(`${root}/c/server/load.php`) // last-resort legacy layout
  return bases
}

function stalkerHeaders(mac: string, token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Cookie: `mac=${mac}; stb_lang=en; timezone=Asia/Kolkata`,
    'User-Agent': FULL_UA,
    'X-User-Agent': STB_UA,
    Accept: '*/*',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

interface StalkerResponse<T> {
  js?: T
  error?: unknown
}

async function stalkerGet<T>(
  apiBase: string,
  params: string,
  mac: string,
  token?: string,
  timeoutMs = 30_000,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = `${apiBase}?${params}`
    const response = await guardedFetch(url, {
      headers: stalkerHeaders(mac, token),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Stalker API HTTP ${response.status}`)
    }
    const json = (await response.json()) as StalkerResponse<T>
    if (json === null || typeof json !== 'object') {
      throw new Error('Stalker API returned invalid JSON')
    }
    if (json.js === undefined) {
      throw new Error('Stalker API rejected the request (no js payload — wrong MAC or portal?)')
    }
    return json.js
  } finally {
    clearTimeout(timer)
  }
}

export interface StalkerChannel {
  id: number | string
  name: string
  number?: string | number
  logo?: string | null
  cmd?: string | null
  tv_genre_id?: number | string
  base_channel_id?: number | string
  censored?: number | string
  hd?: number | string
}

interface StalkerChannelPage {
  total_items?: number
  max_page_items?: number
  data?: StalkerChannel[]
}

export interface StalkerGenre {
  id: number | string
  title: string
}

/**
 * Handshake → { apiBase, token }. Probes the known API layouts and returns the one that
 * answered, so channel fetching reuses the exact working endpoint. Throws a friendly
 * message when every layout refuses (bad portal URL or rejected MAC).
 */
export async function stalkerHandshake(portalUrl: string, mac: string): Promise<{ apiBase: string; token: string }> {
  const candidates = candidateApiBases(portalUrl)
  let lastError: Error | null = null
  for (const apiBase of candidates) {
    try {
      const js = await stalkerGet<{ token?: string }>(apiBase, 'type=stb&action=handshake&JsHttpRequest=1-xml', mac)
      if (js.token) return { apiBase, token: js.token }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Stalker handshake failed')
    }
  }
  throw lastError ?? new Error('Stalker portal ne kisi bhi known API path pe response nahi diya — URL / MAC check karo')
}

/**
 * Fetch ALL channels from a Stalker portal using a MAC.
 * Handles both response shapes (js: [...] or js: {data: [...]}) and
 * auto-paginates when the portal splits results into pages.
 */
export async function stalkerFetchChannels(
  portalUrl: string,
  mac: string,
  device?: StalkerDevice,
): Promise<{ channels: ParsedChannel[]; accountMessage: string | null }> {
  const { apiBase, token } = await stalkerHandshake(portalUrl, mac)

  // Authorise via get_profile as a real MAG box. Portals bind a MAC to a device_id and gate
  // itv calls on it, so we try the known device_id derivations (and any operator-supplied one)
  // on the same token until the portal returns a clean profile. "device conflict / block" =
  // this device_id isn't the one the MAC is registered with.
  let lastBlock: string | null = null
  let authorised = false
  for (const id of deviceIdentities(mac, device)) {
    const profile = await stalkerGet<{ status?: number; block_msg?: string; msg?: string }>(
      apiBase,
      profileQuery(mac, id),
      mac,
      token,
    ).catch(() => null)
    if (!profile) continue
    const blockText = profile.block_msg || (profile.status === 1 ? profile.msg ?? '' : '')
    if (blockText && /conflict|block|not\s*valid|disabled|firmware|reject/i.test(blockText)) {
      lastBlock = blockText.replace(/<br\s*\/?>/gi, ' ').trim()
      continue
    }
    authorised = true
    break
  }
  if (!authorised && lastBlock) {
    throw new Error(`Portal ne device reject kiya: "${lastBlock}". Is MAC ka device_id / serial TiViMate se copy karke daalo (device-locked portal).`)
  }

  // Genres map (best-effort)
  const genreMap = new Map<string, string>()
  try {
    const genres = await stalkerGet<StalkerGenre[]>(
      apiBase,
      'type=itv&action=get_genres&JsHttpRequest=1-xml',
      mac,
      token,
    )
    if (Array.isArray(genres)) {
      for (const genre of genres) {
        genreMap.set(String(genre.id), genre.title)
      }
    }
  } catch {
    // genres are optional
  }

  // First page — detects response shape + pagination info
  const first = await stalkerGet<StalkerChannel[] | StalkerChannelPage>(
    apiBase,
    'type=itv&action=get_all_channels&JsHttpRequest=1-xml',
    mac,
    token,
    60_000,
  )

  let rows: StalkerChannel[] = Array.isArray(first) ? first : (first?.data ?? [])
  const totalItems = Array.isArray(first) ? rows.length : (first?.total_items ?? rows.length)
  const pageSize = Array.isArray(first) ? rows.length : (first?.max_page_items ?? rows.length)

  // Paginate remaining pages (bounded for safety)
  if (!Array.isArray(first) && totalItems > rows.length && pageSize > 0) {
    const totalPages = Math.min(2000, Math.ceil(totalItems / pageSize))
    let cursor = 1
    const CONCURRENCY = 6
    while (cursor < totalPages) {
      const pages: number[] = []
      for (let i = 0; i < CONCURRENCY && cursor < totalPages; i++, cursor++) pages.push(cursor)
      const results = await Promise.all(
        pages.map(async (p) => {
          try {
            const page = await stalkerGet<StalkerChannel[] | StalkerChannelPage>(
              apiBase,
              `type=itv&action=get_all_channels&p=${p}&JsHttpRequest=1-xml`,
              mac,
              token,
              45_000,
            )
            return Array.isArray(page) ? page : (page?.data ?? [])
          } catch {
            return [] as StalkerChannel[]
          }
        }),
      )
      let empty = true
      for (const batch of results) {
        if (batch.length > 0) empty = false
        rows = rows.concat(batch)
      }
      if (empty) break // portal stopped returning data
    }
  }

  if (rows.length === 0) {
    throw new Error('get_all_channels returned no channels (MAC rejected or empty portal)')
  }

  const channels: ParsedChannel[] = []
  const seen = new Set<string>()
  for (const raw of rows) {
    // cmd looks like "ffmpeg http://..." / "ffrt2 http://..." / "http://..."
    const cmd = (raw.cmd ?? '').trim()
    const url = cmd.replace(/^ff(?:mpeg|mpegt|rt2?)\s+/i, '').trim()
    if (!/^https?:\/\//i.test(url)) continue
    if (seen.has(url)) continue
    seen.add(url)

    const genre = genreMap.get(String(raw.tv_genre_id ?? '')) ?? null
    const name = (raw.name ?? '').trim() || `Channel ${raw.number ?? raw.id}`
    const isCensored = raw.censored === 1 || raw.censored === '1'
    const haystack = `${name} ${genre ?? ''}`

    channels.push({
      name,
      url,
      logo: raw.logo || null,
      group: genre,
      tvgId: null,
      tvgCountry: null,
      language: null,
      category: genre ? genre.toLowerCase().replace(/\s+/g, '-') : null,
      country: null,
      countryName: null,
      quality: raw.hd === 1 || raw.hd === '1' ? '1080p' : null,
      isAdult: isCensored || /\b(xxx|adult|porn|18\+)\b/i.test(haystack),
    })
  }

  return { channels, accountMessage: null }
}
