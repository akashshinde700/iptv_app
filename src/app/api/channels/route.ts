import { db } from '@/lib/db'
import { getCustomer, toErrorResponse } from '@/lib/server/auth'
import { buildCustomerChannelWhere } from '@/lib/server/access'
import {
  MAX_AGGREGATED_SOURCES,
  STREAM_SELECT,
  buildChannelWhere,
  dedupeStreamsByUrl,
  parseListParams,
  pickBestStream,
  pickRepresentative,
  portalValidityClause,
  toChannelItem,
} from '@/lib/server/iptv'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Channel catalog — now fully plan-gated.
 *
 * - Guests (no customer session): 403. The UI shows the free demo instead.
 * - Customers: only channels allowed by their plan rules (region/country/
 *   language/category + adult gating + overrides), intersected with the
 *   requested filters. All enforcement is server-side.
 * - Source validity is enforced everywhere: expired/dead sources never serve.
 */
export async function GET(request: Request) {
  try {
    const identity = await getCustomer(request)
    if (!identity) {
      return Response.json(
        { error: 'Plan required — log in or purchase a plan', accessDenied: true, reason: 'guest' },
        { status: 403 }
      )
    }

    const { where: customerWhere, state } = await buildCustomerChannelWhere(identity.id)
    if (!state.hasAccess) {
      return Response.json(
        { error: state.reason, accessDenied: true, reason: state.reason },
        { status: 403 }
      )
    }

    const organizationId = state.organizationId ?? identity.organizationId
    const { searchParams } = new URL(request.url)
    const params = parseListParams(searchParams)

    // User filters (AND-ed with plan rules). Adult toggle can never escalate
    // beyond the plan: when plan.allowAdult is false the customer where already
    // forces isNsfw:false, so passing nsfw=true here has no effect.
    const filterWhere = buildChannelWhere(params, organizationId)

    const finalWhere: Prisma.ChannelWhereInput = {
      AND: [customerWhere, filterWhere, portalValidityClause()],
    }
    const dir: Prisma.SortOrder = params.sort === 'nameDesc' ? 'desc' : 'asc'

    // Dedup the SAME channel that appears in several portals into ONE card, keyed by
    // identityKey. We page over the DISTINCT groups, then hydrate each group's
    // representative row and merge every portal's streams behind it (so the card's
    // source count and best stream reflect all portals; opening it fails over across them).
    const [pageGroups, allGroups] = await Promise.all([
      db.channel.groupBy({
        by: ['identityKey'],
        where: finalWhere,
        orderBy: { identityKey: dir },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      db.channel.groupBy({ by: ['identityKey'], where: finalWhere }),
    ])
    const total = allGroups.length
    const keys = pageGroups.map((g) => g.identityKey).filter((k): k is string => k !== null)

    const members = keys.length
      ? await db.channel.findMany({
          where: { AND: [finalWhere, { identityKey: { in: keys } }] },
          include: { streams: { select: STREAM_SELECT } },
        })
      : []

    const byKey = new Map<string, typeof members>()
    for (const m of members) {
      const k = m.identityKey as string
      const arr = byKey.get(k)
      if (arr) arr.push(m)
      else byKey.set(k, [m])
    }

    // Broad source count: how many distinct sources exist across EVERY portal that carries
    // each channel (same as the detail view's cross-portal failover list), so the card's
    // "N sources" badge matches what the player actually gets — not just the plan-accessible
    // copies. One bounded query for the page's keys; url + isNsfw only (kept light).
    const broadRows = keys.length
      ? await db.channel.findMany({
          where: { organizationId, identityKey: { in: keys }, isActive: true, AND: [portalValidityClause()] },
          select: { identityKey: true, isNsfw: true, streams: { select: { url: true } } },
        })
      : []
    const broadUrls = new Map<string, { sfw: Set<string>; nsfw: Set<string> }>()
    for (const r of broadRows) {
      if (!r.identityKey) continue
      let e = broadUrls.get(r.identityKey)
      if (!e) {
        e = { sfw: new Set(), nsfw: new Set() }
        broadUrls.set(r.identityKey, e)
      }
      const bucket = r.isNsfw ? e.nsfw : e.sfw
      for (const s of r.streams) bucket.add(s.url)
    }

    const items = keys
      .map((k) => byKey.get(k))
      .filter((group): group is typeof members => !!group && group.length > 0)
      .map((group) => {
        const rep = pickRepresentative(group)
        const merged = dedupeStreamsByUrl(group.map((c) => c.streams))
        // count sources of the same rating as the representative (never surfaces adult copies)
        const bucket = rep.identityKey ? broadUrls.get(rep.identityKey) : undefined
        const broadCount = bucket ? (rep.isNsfw ? bucket.nsfw.size : bucket.sfw.size) : 0
        const streamCount = Math.min(Math.max(broadCount, merged.length), MAX_AGGREGATED_SOURCES)
        return { ...toChannelItem(rep), streamCount, bestStream: pickBestStream(merged) }
      })

    return Response.json({
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      plan: state.planName,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
