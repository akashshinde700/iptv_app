import { platformRouteCtx } from '@/lib/server/auth'
import { readJson, updatePayment } from '@/lib/server/billing'

export const dynamic = 'force-dynamic'

/** Mark paid / failed / cancelled, refund, or fix the reference. */
export const PATCH = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const body = await readJson<{ status?: string; notes?: string | null; reference?: string | null }>(request)
  const payment = await updatePayment(id, {}, body, admin, request)
  return Response.json(payment)
})
