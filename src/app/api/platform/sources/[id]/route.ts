import { db } from '@/lib/db'
import { HttpError, platformRouteCtx } from '@/lib/server/auth'
import { readJson } from '@/lib/server/billing'
import { deleteSource, setSourceActive, toSourceDto, updateSource, type SourceInput } from '@/lib/server/sources'

export const dynamic = 'force-dynamic'

type Ctx = { id: string }

/** Source detail: config (masked), health, recent sync history. */
export const GET = platformRouteCtx<Ctx>(async (_request, { params }) => {
  const { id } = await params
  const portal = await db.portal.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      _count: { select: { channels: { where: { isActive: true } } } },
      syncLogs: { orderBy: { startedAt: 'desc' }, take: 15 },
    },
  })
  if (!portal) throw new HttpError(404, 'Source not found')
  const { syncLogs, ...rest } = portal
  return Response.json({ source: toSourceDto(rest), syncLogs })
})

/** Edit name/notes/credentials, or enable/disable (`isActive`). */
export const PATCH = platformRouteCtx<Ctx>(async (request, { params }, admin) => {
  const { id } = await params
  const body = await readJson<SourceInput & { isActive?: boolean }>(request)
  if (body.isActive !== undefined) {
    const channels = await setSourceActive(id, body.isActive, admin, request)
    return Response.json({ ok: true, channels })
  }
  await updateSource(id, body, admin, request)
  return Response.json({ ok: true })
})

/** Delete a source (its channels cascade). Client must confirm the impact. */
export const DELETE = platformRouteCtx<Ctx>(async (request, { params }, admin) => {
  const { id } = await params
  const removed = await deleteSource(id, admin, request)
  return Response.json({ ok: true, removedChannels: removed })
})
