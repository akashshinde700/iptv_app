import { db } from '@/lib/db'
import { adminRoute, audit } from '@/lib/server/auth'
import { keyForEntry, parseBulkText } from '@/lib/server/bulk-import'
import { encryptSecret } from '@/lib/server/crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/portals/bulk
 * Body: { text: string, mode: "preview" | "import" }
 *
 * preview → parse only, flag duplicates against DB (no writes)
 * import  → create non-duplicate portals as PENDING, audit-logged
 */
export const POST = adminRoute(async (request, admin) => {
  let body: { text?: string; mode?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const text = body.text?.trim()
  const mode = body.mode === 'import' ? 'import' : 'preview'
  if (!text || text.length < 8) {
    return Response.json({ error: 'Text mein koi data nahi mila — portals/MACs/links paste karo' }, { status: 400 })
  }

  const parsed = parseBulkText(text)
  if (parsed.entries.length === 0) {
    return Response.json(
      {
        error:
          'Koi valid source detect nahi hua. Text mein Stalker portal + MAC, Xtream get.php link ya M3U link hona chahiye.',
        skippedLines: parsed.skippedLines,
      },
      { status: 422 },
    )
  }

  // Duplicate detection against existing portals (this org only)
  const existing = await db.portal.findMany({
    where: { organizationId: admin.organizationId },
    select: { type: true, url: true, macAddress: true, username: true },
  })
  const existingKeys = new Set(existing.map(keyForEntry))

  const entries = parsed.entries.map((e) => ({
    type: e.type,
    name: e.name,
    url: e.url,
    macAddress: e.macAddress,
    username: e.username,
    hasPassword: e.password !== null,
    expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    expiryText: e.expiryText,
    sourceLine: e.sourceLine,
    duplicate: existingKeys.has(keyForEntry(e)),
  }))

  const duplicates = entries.filter((e) => e.duplicate).length

  if (mode === 'preview') {
    return Response.json({
      mode,
      entries,
      stats: { ...parsed.stats, total: entries.length, duplicates },
      skippedLines: parsed.skippedLines,
    })
  }

  // ---- import ----
  const fresh = parsed.entries.filter((e) => !existingKeys.has(keyForEntry(e)))
  const hostCount = new Map<string, number>()
  let created = 0

  for (const e of fresh) {
    const n = (hostCount.get(e.name) ?? 0) + 1
    hostCount.set(e.name, n)
    const name = n === 1 ? e.name : `${e.name} #${n}`
    await db.portal.create({
      data: {
        organizationId: admin.organizationId,
        name,
        type: e.type,
        url: e.url,
        macAddress: e.macAddress,
        username: e.username,
        password: encryptSecret(e.password),
        expiresAt: e.expiresAt,
        notes: `Bulk import (line ${e.sourceLine})${e.expiryText ? ` • expiry text: ${e.expiryText}` : ''}`,
        status: 'PENDING',
      },
    })
    created++
  }

  await audit({
    adminId: admin.id,
    adminName: admin.username,
    action: 'PORTAL_BULK_IMPORT',
    entityType: 'PORTAL',
    entityId: undefined,
    newValue: {
      created,
      duplicatesSkipped: duplicates,
      byType: { stalker: parsed.stats.stalker, xtream: parsed.stats.xtream, m3u: parsed.stats.m3u },
      skippedLines: parsed.skippedLines,
    },
    request,
  })

  return Response.json({
    mode,
    created,
    duplicatesSkipped: duplicates,
    byType: { stalker: parsed.stats.stalker, xtream: parsed.stats.xtream, m3u: parsed.stats.m3u },
    skippedLines: parsed.skippedLines,
  })
})
