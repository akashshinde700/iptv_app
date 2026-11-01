/**
 * Portal sync orchestrator.
 *
 * For a portal (STALKER | XTREAM | M3U_URL | M3U_FILE):
 *   1. Fetch + parse playlist entries (per type)
 *   2. Diff against existing DB channels of this portal (match on sourceId)
 *   3. INSERT new, UPDATE changed (name/logo/group/quality/adult), DEACTIVATE missing
 *   4. Write SyncLog + update portal status/lastSyncedAt/expiry
 *
 * sourceId for portal channels is stable: `portal:{portalId}:{hash(name|url)}`
 * so re-syncs update in place instead of duplicating.
 */
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/server/crypto'
import { channelIdentityKey } from '@/lib/server/iptv'
import { regionForCountry } from '@/lib/server/regions'
import { parseM3U, fetchPlaylist, type ParsedChannel } from './m3u'
import { fetchXtreamAccount, fetchXtreamChannels } from './xtream'
import { stalkerFetchChannels } from './stalker'

function portalSourceId(portalId: string, name: string, url: string): string {
  const hash = createHash('sha1').update(`${name.toLowerCase()}|${url}`).digest('hex').slice(0, 20)
  return `portal:${portalId}:${hash}`
}

async function entriesForPortal(
  portal: { id: string; type: string; url: string | null; macAddress: string | null; username: string | null; password: string | null; fileData: string | null; deviceId?: string | null; deviceId2?: string | null; serialNumber?: string | null },
): Promise<{ entries: ParsedChannel[]; expiresAt: Date | null; note: string | null }> {
  switch (portal.type) {
    case 'M3U_FILE': {
      if (!portal.fileData) throw new Error('Portal has no uploaded file content')
      return { entries: parseM3U(portal.fileData), expiresAt: null, note: null }
    }
    case 'M3U_URL': {
      if (!portal.url) throw new Error('M3U link missing')
      const content = await fetchPlaylist(portal.url)
      return { entries: parseM3U(content), expiresAt: null, note: null }
    }
    case 'XTREAM': {
      if (!portal.url || !portal.username || !portal.password) throw new Error('Xtream server/username/password missing')
      const account = await fetchXtreamAccount(portal.url, portal.username, portal.password)
      // Validity gate: expired / banned accounts are rejected BEFORE any channel is written.
      if (account) {
        const deadStatus = /^(expired|banned|disabled)/i.test(account.status ?? '')
        if (deadStatus) {
          throw new Error(`Xtream account ${account.status!.toLowerCase()} hai — validity khatam, sync cancel`)
        }
        if (account.expiresAt && account.expiresAt < new Date()) {
          throw new Error(`Xtream account expired on ${account.expiresAt.toISOString().slice(0, 10)} — validity khatam, sync cancel`)
        }
      }
      const entries = await fetchXtreamChannels(portal.url, portal.username, portal.password)
      const note = account ? `${account.status ?? 'Active'}${account.maxConnections ? ` • ${account.maxConnections} connection` : ''}` : null
      return { entries, expiresAt: account?.expiresAt ?? null, note }
    }
    case 'STALKER': {
      if (!portal.url || !portal.macAddress) throw new Error('Stalker panel URL / MAC missing')
      const { channels } = await stalkerFetchChannels(portal.url, portal.macAddress, {
        deviceId: portal.deviceId,
        deviceId2: portal.deviceId2,
        serialNumber: portal.serialNumber,
      })
      return { entries: channels, expiresAt: null, note: null }
    }
    default:
      throw new Error(`Unknown portal type: ${portal.type}`)
  }
}

export interface SyncResult {
  portalId: string
  added: number
  updated: number
  removed: number
  total: number
  durationMs: number
}

export async function syncPortal(portalId: string): Promise<SyncResult> {
  const startedAt = Date.now()
  const portal = await db.portal.findUnique({ where: { id: portalId } })
  if (!portal) throw new Error('Portal not found')

  const log = await db.syncLog.create({
    data: { portalId, status: 'RUNNING' },
  })

  await db.portal.update({ where: { id: portalId }, data: { status: 'SYNCING', lastError: null } })

  try {
    const { entries, expiresAt, note } = await entriesForPortal({
      ...portal,
      password: decryptSecret(portal.password),
    })

    if (entries.length === 0) {
      throw new Error('Playlist parsed but contained 0 usable channels')
    }

    // Validity gate: a source whose expiry has passed never syncs (admin-imported
    // expiry dates are respected exactly like live-detected ones).
    if (expiresAt && expiresAt < new Date()) {
      throw new Error(`Source ki validity ${expiresAt.toISOString().slice(0, 10)} ko khatam ho gayi — sync cancel`)
    }

    const existing = await db.channel.findMany({
      where: { portalId },
      select: { id: true, sourceId: true, name: true, logo: true, categories: true, languages: true, isNsfw: true, isActive: true },
    })
    const existingBySource = new Map(existing.map((c) => [c.sourceId, c]))

    const seenSourceIds = new Set<string>()
    // Dedupe WITHIN this playlist: many public M3Us repeat the same channel line
    // (e.g. a pinned promo entry twice). Two identical name+url rows hash to the same
    // sourceId, and a single duplicate would otherwise crash the whole createMany batch
    // with a unique-constraint error — killing the entire import. TiViMate just ignores
    // repeats; so do we.
    const queuedSourceIds = new Set<string>()

    // Batch inserts to avoid overwhelming SQLite (per-row create of 10k+ channels OOMs next-server)
    const toCreate: ParsedChannel[] = []
    const toUpdate: { id: string; entry: ParsedChannel }[] = []

    for (const entry of entries) {
      const sourceId = portalSourceId(portalId, entry.name, entry.url)
      seenSourceIds.add(sourceId)

      const categories = entry.category ? `|${entry.category}|` : '|'
      const languages = entry.language ? `|${entry.language}|` : '|'

      const match = existingBySource.get(sourceId)
      if (!match) {
        // Skip a repeat of a line we've already queued this run.
        if (queuedSourceIds.has(sourceId)) continue
        queuedSourceIds.add(sourceId)
        toCreate.push(entry)
        continue
      }

      const changed =
        match.name !== entry.name ||
        match.logo !== entry.logo ||
        match.categories !== categories ||
        match.languages !== languages ||
        match.isNsfw !== entry.isAdult ||
        !match.isActive

      if (changed) toUpdate.push({ id: match.id, entry })
    }

    // Batched channel inserts (chunks of 500 via createMany), then batched streams
    const CHUNK = 500
    const createdSourceIds: string[] = []
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const chunk = toCreate.slice(i, i + CHUNK).map((entry) => {
        const sourceId = portalSourceId(portalId, entry.name, entry.url)
        createdSourceIds.push(sourceId)
        const region = regionForCountry(entry.country)
        return {
          sourceId,
          name: entry.name,
          identityKey: channelIdentityKey(entry.name),
          logo: entry.logo,
          country: entry.country,
          countryName: entry.countryName,
          region,
          categories: entry.category ? `|${entry.category}|` : '|',
          languages: entry.language ? `|${entry.language}|` : '|',
          isNsfw: entry.isAdult,
          portalId,
          organizationId: portal.organizationId,
        }
      })
      // skipDuplicates: a concurrent/retried sync may already have inserted some of
      // these sourceIds — skip them instead of failing the whole batch.
      await db.channel.createMany({ data: chunk, skipDuplicates: true })
    }

    // Map back ids for the newly created channels, then batch-insert streams
    const idRows: { id: string; sourceId: string }[] = []
    for (let i = 0; i < createdSourceIds.length; i += CHUNK) {
      const rows = await db.channel.findMany({
        where: { portalId, sourceId: { in: createdSourceIds.slice(i, i + CHUNK) } },
        select: { id: true, sourceId: true },
      })
      idRows.push(...rows)
    }
    const idBySource = new Map(idRows.map((r) => [r.sourceId, r.id]))

    const streamRows: { channelId: string; url: string; quality: string | null; title: string | null; portalId: string }[] = []
    for (const entry of toCreate) {
      const sourceId = portalSourceId(portalId, entry.name, entry.url)
      const channelId = idBySource.get(sourceId)
      if (!channelId) continue // should not happen
      streamRows.push({ channelId, url: entry.url, quality: entry.quality, title: entry.group, portalId })
    }
    for (let i = 0; i < streamRows.length; i += CHUNK) {
      await db.stream.createMany({ data: streamRows.slice(i, i + CHUNK) })
    }

    // Batched updates (only changed rows)
    for (const { id, entry } of toUpdate) {
      const region = regionForCountry(entry.country)
      await db.channel.update({
        where: { id },
        data: {
          name: entry.name,
          identityKey: channelIdentityKey(entry.name),
          logo: entry.logo,
          categories: entry.category ? `|${entry.category}|` : '|',
          languages: entry.language ? `|${entry.language}|` : '|',
          isNsfw: entry.isAdult,
          isActive: true,
          region: region ?? undefined,
          country: entry.country ?? undefined,
          countryName: entry.countryName ?? undefined,
        },
      })
    }
    const updated = toUpdate.length

    // Deactivate channels that disappeared from the portal (single updateMany)
    const missingIds = existing.filter((c) => !seenSourceIds.has(c.sourceId) && c.isActive).map((c) => c.id)
    if (missingIds.length > 0) {
      await db.channel.updateMany({ where: { id: { in: missingIds } }, data: { isActive: false } })
    }
    const removed = missingIds.length

    const finishedAt = new Date()
    await db.syncLog.update({
      where: { id: log.id },
      data: {
        finishedAt,
        added: toCreate.length,
        updated,
        removed,
        status: 'SUCCESS',
        message: note ?? `${entries.length} channels in playlist`,
      },
    })
    await db.portal.update({
      where: { id: portalId },
      data: {
        status: 'ACTIVE',
        lastSyncedAt: finishedAt,
        lastError: null,
        expiresAt: expiresAt ?? portal.expiresAt,
      },
    })

    return { portalId, added: toCreate.length, updated, removed, total: entries.length, durationMs: Date.now() - startedAt }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error'
    await db.syncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), status: 'ERROR', message },
    })
    await db.portal.update({
      where: { id: portalId },
      data: { status: 'ERROR', lastError: message },
    })
    throw error
  }
}
