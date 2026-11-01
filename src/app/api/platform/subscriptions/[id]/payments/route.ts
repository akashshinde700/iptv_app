import { platformRouteCtx } from '@/lib/server/auth'
import { readJson, recordPayment, type PaymentInput } from '@/lib/server/billing'

export const dynamic = 'force-dynamic'

/** Record a payment received for a subscription (manual — no gateway yet). */
export const POST = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const body = await readJson<PaymentInput>(request)
  const payment = await recordPayment(id, {}, body, admin, request)
  return Response.json(payment, { status: 201 })
})
