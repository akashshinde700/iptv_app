import { platformRouteCtx } from '@/lib/server/auth'
import { createSubscription, readJson, type SubscriptionInput } from '@/lib/server/billing'

export const dynamic = 'force-dynamic'

/** Create a subscription (or change plan with replaceCurrent: true). */
export const POST = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const body = await readJson<SubscriptionInput>(request)
  const sub = await createSubscription(id, {}, body, admin, request)
  return Response.json(sub, { status: 201 })
})
