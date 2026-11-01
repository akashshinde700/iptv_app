import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/server/auth'

export interface PlanInput {
  name?: string
  description?: string | null
  price?: number
  durationDays?: number
  allowAdult?: boolean
  maxDevices?: number
  regions?: string[] | string
  countries?: string[] | string
  languages?: string[] | string
  categories?: string[] | string
  isActive?: boolean
}

/** Access-rule list (array or comma-separated) → the pipe-delimited column format. */
export function toPipe(values: string[] | string | undefined): string | undefined {
  if (values === undefined) return undefined
  const list = Array.isArray(values) ? values : values.split(',')
  const clean = [...new Set(list.map((v) => v.trim()).filter(Boolean))]
  return clean.length > 0 ? `|${clean.join('|')}|` : '|'
}

function whole(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`)
  const i = Math.floor(n)
  if (i < min || i > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`)
  return i
}

/** Validated plan fields. `partial` = only what was sent (edit). */
export function planData(input: PlanInput, partial: boolean): Prisma.PlanUncheckedUpdateInput {
  const data: Prisma.PlanUncheckedUpdateInput = {}
  if (!partial || input.name !== undefined) {
    const name = input.name?.trim()
    if (!name) throw new HttpError(400, 'Plan name is required')
    data.name = name
  }
  if (input.description !== undefined) data.description = input.description?.trim() || null
  if (input.price !== undefined) data.price = whole(input.price, 0, 10_000_000, 'Price')
  if (input.durationDays !== undefined) data.durationDays = whole(input.durationDays, 1, 3650, 'Duration (days)')
  if (input.maxDevices !== undefined) data.maxDevices = whole(input.maxDevices, 1, 50, 'Device limit')
  if (input.allowAdult !== undefined) data.allowAdult = !!input.allowAdult
  if (input.isActive !== undefined) data.isActive = !!input.isActive
  for (const key of ['regions', 'countries', 'languages', 'categories'] as const) {
    const pipe = toPipe(input[key])
    if (pipe !== undefined) data[key] = pipe
  }
  return data
}

/**
 * Replace a plan's explicit channel list, keeping only channels that belong to the
 * plan's own organization (never trust client-supplied ids across tenants).
 */
export async function setPlanChannels(planId: string, organizationId: string, channelIds: string[] | undefined): Promise<void> {
  if (channelIds === undefined) return
  const wanted = [...new Set(channelIds.filter(Boolean))].slice(0, 5000)
  const valid = wanted.length
    ? (await db.channel.findMany({ where: { id: { in: wanted }, organizationId }, select: { id: true } })).map((c) => c.id)
    : []
  const existing = (await db.planChannel.findMany({ where: { planId }, select: { channelId: true } })).map((c) => c.channelId)
  const validSet = new Set(valid)
  const existingSet = new Set(existing)
  const toAdd = valid.filter((id) => !existingSet.has(id))
  const toRemove = existing.filter((id) => !validSet.has(id))
  if (toRemove.length) await db.planChannel.deleteMany({ where: { planId, channelId: { in: toRemove } } })
  if (toAdd.length) await db.planChannel.createMany({ data: toAdd.map((channelId) => ({ planId, channelId })) })
}

export function splitRules(plan: { regions: string; countries: string; languages: string; categories: string }) {
  const split = (v: string) => v.split('|').filter(Boolean)
  return {
    regions: split(plan.regions),
    countries: split(plan.countries),
    languages: split(plan.languages),
    categories: split(plan.categories),
  }
}
