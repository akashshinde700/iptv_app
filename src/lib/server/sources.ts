/**
 * Content sources (IPTV portals) — shared helpers used by the platform console.
 *
 * Reuses the existing `Portal` model (STALKER | XTREAM | M3U_URL | M3U_FILE), the
 * sync engine (syncPortal) and crypto. Credentials are AES-encrypted at rest and
 * NEVER returned to the client — GET responses carry masked values only.
 *
 * "Test connection" is deliberately separate from "sync": testing verifies
 * reachability / auth and estimates the channel count WITHOUT importing anything.
 */
import { db } from '@/lib/db'
import { audit, HttpError, type AdminIdentity } from '@/lib/server/auth'
import { decryptSecret, encryptSecret } from '@/lib/server/crypto'
import { assertPublicSourceUrl, guardedFetch } from '@/lib/server/net-guard'
import { fetchPlaylist, parseM3U } from '@/lib/server/sync/m3u'
import { fetchXtreamAccount, fetchXtreamVodCounts, xtreamPlaylistUrl } from '@/lib/server/sync/xtream'
import { stalkerHandshake } from '@/lib/server/sync/stalker'

export const SOURCE_TYPES = ['STALKER', 'XTREAM', 'M3U_URL', 'M3U_FILE'] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/

/** 00-1A-79-AA-BB-CC / 001A79AABBCC → 00:1A:79:AA:BB:CC (uppercase). Throws on invalid. */
export function normalizeMac(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').trim().toUpperCase().replace(/[^0-9A-F]/g, '')
  if (cleaned.length !== 12) throw new HttpError(400, 'Enter a valid MAC address (e.g. 00:1A:79:AA:BB:CC)')
  const mac = cleaned.match(/.{2}/g)!.join(':')
  if (!MAC_RE.test(mac)) throw new HttpError(400, 'Enter a valid MAC address (e.g. 00:1A:79:AA:BB:CC)')
  return mac
}

/** Mask username/password query params so a credential URL is safe to display. */
export function maskCredentialUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    for (const key of ['username', 'password', 'user', 'pass', 'token']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '••••••')
    }
    return decodeURIComponent(url.toString())
  } catch {
    return raw.replace(/(username|password|user|pass|token)=[^&]*/gi, '$1=••••••')
  }
}

export interface SourceInput {
  name?: string
  type?: string
  url?: string | null
  macAddress?: string | null
  deviceId?: string | null
  deviceId2?: string | null
  serialNumber?: string | null
  username?: string | null
  password?: string | null
  epgUrl?: string | null
  notes?: string | null
  fileData?: string | null
}

interface DraftConfig {
  type: SourceType
  url: string | null
  macAddress: string | null
  deviceId: string | null
  deviceId2: string | null
  serialNumber: string | null
  username: string | null
  password: string | null
  fileData: string | null
}

/** Validate + normalise the connection fields for a given source type. */
export function normalizeConfig(input: SourceInput, existing?: DraftConfig): DraftConfig {
  const type = (input.type?.trim().toUpperCase() ?? existing?.type) as SourceType | undefined
  if (!type || !SOURCE_TYPES.includes(type)) throw new HttpError(400, 'Choose a source type')

  const cfg: DraftConfig = {
    type,
    url: input.url !== undefined ? input.url?.trim() || null : existing?.url ?? null,
    macAddress: existing?.macAddress ?? null,
    deviceId: input.deviceId !== undefined ? input.deviceId?.trim() || null : existing?.deviceId ?? null,
    deviceId2: input.deviceId2 !== undefined ? input.deviceId2?.trim() || null : existing?.deviceId2 ?? null,
    serialNumber: input.serialNumber !== undefined ? input.serialNumber?.trim() || null : existing?.serialNumber ?? null,
    username: input.username !== undefined ? input.username?.trim() || null : existing?.username ?? null,
    // password: undefined = keep existing; '' or value = change
    password: input.password !== undefined ? (input.password ? input.password : null) : existing?.password ?? null,
    fileData: input.fileData !== undefined ? input.fileData ?? null : existing?.fileData ?? null,
  }

  if (type === 'STALKER') {
    cfg.macAddress = normalizeMac(input.macAddress ?? existing?.macAddress)
    assertPublicSourceUrl(cfg.url, 'Portal URL')
  } else if (type === 'XTREAM') {
    assertPublicSourceUrl(cfg.url, 'Server URL')
    if (!cfg.username) throw new HttpError(400, 'Xtream username is required')
    if (!cfg.password) throw new HttpError(400, 'Xtream password is required')
  } else if (type === 'M3U_URL') {
    assertPublicSourceUrl(cfg.url, 'M3U URL')
  } else if (type === 'M3U_FILE') {
    if (!cfg.fileData || !/#EXTM3U/i.test(cfg.fileData)) throw new HttpError(400, 'Upload a valid .m3u playlist file')
  }
  return cfg
}

export interface TestResult {
  ok: boolean
  message: string
  channelEstimate: number | null
  expiresAt: string | null
  accountStatus: string | null
  maxConnections: number | null
  movieCount?: number | null
  seriesCount?: number | null
}

/** Verify a source works — reachability / auth / a channel estimate — WITHOUT importing. */
export async function testConnection(cfg: DraftConfig): Promise<TestResult> {
  const base: TestResult = { ok: false, message: '', channelEstimate: null, expiresAt: null, accountStatus: null, maxConnections: null }
  try {
    switch (cfg.type) {
      case 'XTREAM': {
        const account = await fetchXtreamAccount(cfg.url!, cfg.username!, cfg.password!)
        if (!account) return { ...base, message: 'Could not authenticate — check the server URL, username and password.' }
        const dead = /^(expired|banned|disabled)/i.test(account.status ?? '')
        if (dead) {
          return { ...base, message: `This account is ${account.status}.`, accountStatus: account.status, expiresAt: account.expiresAt?.toISOString() ?? null }
        }
        // lightweight channel estimate via get_live_streams (ids only)
        let estimate: number | null = null
        try {
          const api = `${cfg.url!.replace(/\/+$/, '')}/player_api.php?username=${encodeURIComponent(cfg.username!)}&password=${encodeURIComponent(cfg.password!)}&action=get_live_streams`
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 30_000)
          const res = await guardedFetch(api, { signal: controller.signal }).finally(() => clearTimeout(timer))
          if (res.ok) {
            const list = (await res.json()) as unknown[]
            if (Array.isArray(list)) estimate = list.length
          }
        } catch {
          /* estimate is best-effort */
        }
        // VOD availability (Movies + Series) — best-effort probe
        let vod = { movies: 0, series: 0 }
        try {
          vod = await fetchXtreamVodCounts(cfg.url!, cfg.username!, cfg.password!)
        } catch {
          /* VOD probe best-effort */
        }
        const vodMsg = vod.movies || vod.series ? ` • ${vod.movies.toLocaleString('en-IN')} movies, ${vod.series.toLocaleString('en-IN')} series` : ''
        return {
          ok: true,
          message: `Connected — account is ${account.status ?? 'active'}.${vodMsg}`,
          channelEstimate: estimate,
          expiresAt: account.expiresAt?.toISOString() ?? null,
          accountStatus: account.status,
          maxConnections: account.maxConnections,
          movieCount: vod.movies,
          seriesCount: vod.series,
        }
      }
      case 'STALKER': {
        await stalkerHandshake(cfg.url!, cfg.macAddress!) // throws if the MAC/portal is rejected
        return { ...base, ok: true, message: 'Portal reachable and the MAC was accepted.' }
      }
      case 'M3U_URL': {
        // fetch a capped slice — enough to confirm it's a playlist and estimate size
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 30_000)
        try {
          const res = await guardedFetch(cfg.url!, { signal: controller.signal, headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' } })
          if (!res.ok) return { ...base, message: `The URL returned HTTP ${res.status}.` }
          const text = await res.text()
          if (!/#EXTM3U/i.test(text.slice(0, 500))) return { ...base, message: 'This URL did not return a valid M3U playlist.' }
          const count = (text.match(/#EXTINF/gi) ?? []).length
          return { ...base, ok: true, message: 'Valid M3U playlist.', channelEstimate: count }
        } finally {
          clearTimeout(timer)
        }
      }
      case 'M3U_FILE': {
        const count = parseM3U(cfg.fileData ?? '').length
        if (count === 0) return { ...base, message: 'The uploaded file has no playable channels.' }
        return { ...base, ok: true, message: 'Valid playlist file.', channelEstimate: count }
      }
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Connection failed'
    // never leak a full authenticated URL in the message
    return { ...base, message: maskCredentialUrl(raw) ?? 'Connection failed' }
  }
}

/** The decrypted connection fields for testing/sync (server-side only). */
export function decryptedConfig(portal: {
  type: string
  url: string | null
  macAddress: string | null
  deviceId?: string | null
  deviceId2?: string | null
  serialNumber?: string | null
  username: string | null
  password: string | null
  fileData: string | null
}): DraftConfig {
  return {
    type: portal.type as SourceType,
    url: portal.url,
    macAddress: portal.macAddress,
    deviceId: portal.deviceId ?? null,
    deviceId2: portal.deviceId2 ?? null,
    serialNumber: portal.serialNumber ?? null,
    username: portal.username,
    password: decryptSecret(portal.password),
    fileData: portal.fileData,
  }
}

/** Shape a Portal row for the client — credentials masked, playlist body dropped. */
export function toSourceDto(portal: {
  id: string
  organizationId: string
  name: string
  type: string
  url: string | null
  macAddress: string | null
  deviceId?: string | null
  deviceId2?: string | null
  serialNumber?: string | null
  username: string | null
  password: string | null
  epgUrl: string | null
  status: string
  lastError: string | null
  lastSyncedAt: Date | null
  expiresAt: Date | null
  notes: string | null
  isActive: boolean
  fileData?: string | null
  createdAt: Date
  updatedAt: Date
  organization?: { id: string; name: string } | null
  _count?: { channels: number }
}) {
  // deviceId/deviceId2/serialNumber are dropped here — never shipped to the browser.
  const { password, fileData, deviceId, deviceId2, serialNumber, _count, ...rest } = portal
  void deviceId
  void deviceId2
  void serialNumber
  const isCredentialUrl = portal.type === 'M3U_URL' || portal.type === 'XTREAM'
  return {
    ...rest,
    hasPassword: !!password,
    hasFileData: !!fileData,
    displayUrl: isCredentialUrl ? maskCredentialUrl(portal.url) : portal.url,
    playlistUrl: portal.type === 'XTREAM' && portal.username ? maskCredentialUrl(xtreamPlaylistUrl(portal.url ?? '', portal.username, 'x')) : null,
    channelCount: _count?.channels ?? 0,
  }
}

export async function createSource(organizationId: string, input: SourceInput, actor: AdminIdentity, request?: Request) {
  const name = input.name?.trim()
  if (!name) throw new HttpError(400, 'Source name is required')
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
  if (!org) throw new HttpError(400, 'Organization not found')
  const cfg = normalizeConfig(input)

  const portal = await db.portal.create({
    data: {
      organizationId,
      name,
      type: cfg.type,
      url: cfg.url,
      macAddress: cfg.macAddress,
      deviceId: cfg.deviceId,
      deviceId2: cfg.deviceId2,
      serialNumber: cfg.serialNumber,
      username: cfg.username,
      password: encryptSecret(cfg.password),
      epgUrl: input.epgUrl?.trim() || null,
      notes: input.notes?.trim() || null,
      fileData: cfg.fileData,
      status: 'PENDING',
      isActive: true,
    },
  })
  await audit({
    organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: 'SOURCE_CREATE',
    entityType: 'PORTAL',
    entityId: portal.id,
    newValue: { name, type: cfg.type, host: cfg.url ? new URL(cfg.url).host : null },
    request,
  })
  return portal
}

export async function updateSource(id: string, input: SourceInput, actor: AdminIdentity, request?: Request) {
  const portal = await db.portal.findUnique({ where: { id } })
  if (!portal) throw new HttpError(404, 'Source not found')

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new HttpError(400, 'Source name is required')
    data.name = input.name.trim()
  }
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null
  if (input.epgUrl !== undefined) data.epgUrl = input.epgUrl?.trim() || null

  // connection fields — revalidate against the current type
  const touchesConn = ['url', 'macAddress', 'deviceId', 'deviceId2', 'serialNumber', 'username', 'password', 'fileData'].some((k) => input[k as keyof SourceInput] !== undefined)
  let credentialsChanged = false
  if (touchesConn) {
    const cfg = normalizeConfig({ ...input, type: portal.type }, decryptedConfig(portal))
    data.url = cfg.url
    data.macAddress = cfg.macAddress
    data.deviceId = cfg.deviceId
    data.deviceId2 = cfg.deviceId2
    data.serialNumber = cfg.serialNumber
    data.username = cfg.username
    data.fileData = cfg.fileData
    if (input.password !== undefined) {
      data.password = encryptSecret(cfg.password)
      credentialsChanged = true
    }
  }

  const updated = await db.portal.update({ where: { id }, data })
  await audit({
    organizationId: portal.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: credentialsChanged ? 'SOURCE_CREDENTIALS_CHANGE' : 'SOURCE_UPDATE',
    entityType: 'PORTAL',
    entityId: id,
    // never log the secret itself
    newValue: { name: updated.name, credentialsChanged },
    request,
  })
  return updated
}

export async function setSourceActive(id: string, isActive: boolean, actor: AdminIdentity, request?: Request) {
  const portal = await db.portal.findUnique({ where: { id }, include: { _count: { select: { channels: { where: { isActive: true } } } } } })
  if (!portal) throw new HttpError(404, 'Source not found')
  await db.portal.update({ where: { id }, data: { isActive } })
  // disabling a source hides its channels from customers immediately
  await db.channel.updateMany({ where: { portalId: id }, data: { isActive } })
  await audit({
    organizationId: portal.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: isActive ? 'SOURCE_ENABLE' : 'SOURCE_DISABLE',
    entityType: 'PORTAL',
    entityId: id,
    newValue: { channels: portal._count.channels },
    request,
  })
  return portal._count.channels
}

export async function deleteSource(id: string, actor: AdminIdentity, request?: Request) {
  const portal = await db.portal.findUnique({ where: { id }, include: { _count: { select: { channels: true } } } })
  if (!portal) throw new HttpError(404, 'Source not found')
  await db.portal.delete({ where: { id } }) // channels cascade
  await audit({
    organizationId: portal.organizationId,
    adminId: actor.id,
    adminName: actor.username,
    action: 'SOURCE_DELETE',
    entityType: 'PORTAL',
    entityId: id,
    oldValue: { name: portal.name, type: portal.type, channels: portal._count.channels },
    request,
  })
  return portal._count.channels
}
