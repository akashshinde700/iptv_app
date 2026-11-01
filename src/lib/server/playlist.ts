/**
 * Personal M3U playlist — "watch anywhere" without picking a server.
 *
 * A customer gets one stable URL. Feed it to VLC, TiviMate, OTT Navigator, Kodi, an Android
 * TV box or an iPhone player and the playlist always contains the **currently working**
 * source for each channel in their plan (health-ranked, dead streams already excluded by the
 * health doctor). No login in the player, no manual failover, no app install.
 *
 * The URL itself is the credential, so it is HMAC-signed with a server secret: it can't be
 * guessed, and it carries no portal credentials — every entry points at our /api/proxy with
 * an encrypted token, exactly like the web player. Rotating PROXY_SIGNING_SECRET invalidates
 * every playlist at once (do that if a customer leaks theirs).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '@/lib/db'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import { sortStreams, splitPipe, STREAM_SELECT } from '@/lib/server/iptv'
import { signedProxyPath } from '@/lib/server/proxy-sign'

const SECRET = process.env.PROXY_SIGNING_SECRET ?? ''
const TOKEN_VERSION = 'p1'
/** Playlist links live long (people paste them once); the streams inside are re-resolved
 *  every time the client refreshes the playlist. */
const STREAM_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Safety cap so one huge plan can't generate an unbounded file. */
const MAX_CHANNELS = 5000

function sign(customerId: string): string {
  return createHmac('sha256', SECRET || 'dev-insecure-secret')
    .update(`${TOKEN_VERSION}:${customerId}`)
    .digest('base64url')
    .slice(0, 32)
}

/** Opaque, stable per-customer token: <customerId>.<hmac> (ids are cuids, not secrets). */
export function playlistToken(customerId: string): string {
  return Buffer.from(`${customerId}.${sign(customerId)}`, 'utf8').toString('base64url')
}

export function verifyPlaylistToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const dot = decoded.lastIndexOf('.')
    if (dot <= 0) return null
    const customerId = decoded.slice(0, dot)
    const provided = decoded.slice(dot + 1)
    const expected = sign(customerId)
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return customerId
  } catch {
    return null
  }
}

export function playlistPath(customerId: string): string {
  return `/api/playlist/${playlistToken(customerId)}/streamkaro.m3u`
}

export function playlistUrl(origin: string, customerId: string): string {
  return `${origin.replace(/\/$/, '')}${playlistPath(customerId)}`
}

function m3uAttribute(value: string): string {
  return value.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim()
}

export interface PlaylistBuild {
  content: string
  channels: number
  /** channels in the plan that currently have no working source (skipped on purpose) */
  skipped: number
}

/**
 * Build the playlist text for one customer. Only channels they may watch AND that have a
 * live (non-disabled) source are emitted — a broken channel simply isn't in the file.
 */
export async function buildPlaylist(customerId: string): Promise<PlaylistBuild | null> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, username: true, status: true },
  })
  if (!customer) return null

  const { where, state } = await buildCustomerChannelWhere(customer.id)
  if (!state.hasAccess) return { content: header(customer.name), channels: 0, skipped: 0 }

  const channels = await db.channel.findMany({
    where,
    select: {
      id: true,
      name: true,
      logo: true,
      categories: true,
      languages: true,
      country: true,
      isNsfw: true,
      streams: { select: STREAM_SELECT },
    },
    orderBy: { name: 'asc' },
    take: MAX_CHANNELS,
  })

  const lines: string[] = [header(customer.name)]
  let emitted = 0
  let skipped = 0

  for (const channel of channels) {
    const usable = channel.streams.filter((stream) => stream.status !== 'DISABLED')
    const best = sortStreams(usable)[0]
    if (!best) {
      skipped += 1
      continue
    }
    const group = splitPipe(channel.categories)[0] ?? (channel.isNsfw ? 'Adult' : 'Live TV')
    const groupTitle = group.charAt(0).toUpperCase() + group.slice(1)
    const languages = splitPipe(channel.languages).join(', ')
    lines.push(
      `#EXTINF:-1 tvg-id="${m3uAttribute(channel.id)}" tvg-name="${m3uAttribute(channel.name)}"` +
        (channel.logo ? ` tvg-logo="${m3uAttribute(channel.logo)}"` : '') +
        ` group-title="${m3uAttribute(groupTitle)}"` +
        (languages ? ` tvg-language="${m3uAttribute(languages)}"` : '') +
        `,${m3uAttribute(channel.name)}`,
    )
    // Relative path here; the route absolutizes it with the requesting host, so the same
    // playlist works behind any domain (custom storefront domains included).
    lines.push(signedProxyPath(best.url, best.userAgent, best.referrer, STREAM_TTL_MS))
    emitted += 1
  }

  return { content: lines.join('\n'), channels: emitted, skipped }
}

function header(name: string): string {
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  return `#EXTM3U\n# StreamKaro playlist for ${m3uAttribute(name)}\n# generated ${stamp}\n# dead sources are removed automatically — just refresh this playlist\n`
}

/** Rewrite the relative proxy paths into absolute URLs for the requesting host. */
export function absolutize(content: string, origin: string): string {
  const base = origin.replace(/\/$/, '')
  return content
    .split('\n')
    .map((line) => (line.startsWith('/api/proxy') ? `${base}${line}` : line))
    .join('\n')
}
