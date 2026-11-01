import { HttpError, platformRouteCtx } from '@/lib/server/auth'
import { changeSubscription, readJson, type PaymentInput, type SubscriptionAction } from '@/lib/server/billing'

export const dynamic = 'force-dynamic'

const ACTIONS: SubscriptionAction[] = ['renew', 'extend', 'suspend', 'resume', 'cancel']

/** renew | extend | suspend | resume | cancel */
export const PATCH = platformRouteCtx<{ id: string }>(async (request, { params }, admin) => {
  const { id } = await params
  const body = await readJson<{
    action?: string
    days?: number
    price?: number
    discount?: number
    payment?: PaymentInput | null
  }>(request)
  if (!body.action || !ACTIONS.includes(body.action as SubscriptionAction)) throw new HttpError(400, 'Unknown action')
  const result = await changeSubscription(id, {}, body.action as SubscriptionAction, body, admin, request)
  return Response.json(result)
})
