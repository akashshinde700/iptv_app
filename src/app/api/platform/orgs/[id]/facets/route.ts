import { db } from '@/lib/db'
import { HttpError, platformRouteCtx } from '@/lib/server/auth'
import { splitPipe } from '@/lib/server/iptv'

export const dynamic = 'force-dynamic'

const CATEGORY_NAMES: Record<string, string> = {
  news: 'News', sports: 'Sports', movies: 'Movies', entertainment: 'Entertainment', kids: 'Kids',
  music: 'Music', documentary: 'Documentary', religious: 'Religious', series: 'Series', lifestyle: 'Lifestyle',
  food: 'Food', travel: 'Travel', education: 'Education', business: 'Business', weather: 'Weather',
  science: 'Science', comedy: 'Comedy', animation: 'Animation', classic: 'Classic', culture: 'Culture',
  family: 'Family', general: 'General', legislative: 'Legislative', outdoor: 'Outdoor', relax: 'Relax',
  shop: 'Shop', auto: 'Auto', xxx: 'XXX', undefined: 'Other',
}
const label = (slug: string) => CATEGORY_NAMES[slug] ?? (slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'Other')

const cache = new Map<string, { at: number; data: unknown }>()
const TTL = 5 * 60 * 1000

/** Real dropdown options for the plan builder — categories/languages/countries/regions with counts. */
export const GET = platformRouteCtx<{ id: string }>(async (_request, { params }) => {
  const { id: organizationId } = await params
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
  if (!org) throw new HttpError(404, 'Organization not found')

  const hit = cache.get(organizationId)
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.data)

  const channels = await db.channel.findMany({
    where: { organizationId, isActive: true },
    select: { region: true, country: true, countryName: true, countryFlag: true, languages: true, categories: true },
  })

  const regions = new Map<string, number>()
  const countries = new Map<string, { name: string; flag: string | null; count: number }>()
  const languages = new Map<string, number>()
  const categories = new Map<string, number>()
  for (const c of channels) {
    if (c.region) regions.set(c.region, (regions.get(c.region) ?? 0) + 1)
    if (c.country) {
      const e = countries.get(c.country) ?? { name: c.countryName ?? c.country, flag: c.countryFlag, count: 0 }
      e.count++
      if (!e.name && c.countryName) e.name = c.countryName
      countries.set(c.country, e)
    }
    for (const l of splitPipe(c.languages)) languages.set(l, (languages.get(l) ?? 0) + 1)
    for (const cat of splitPipe(c.categories)) categories.set(cat, (categories.get(cat) ?? 0) + 1)
  }

  const data = {
    totalChannels: channels.length,
    categories: [...categories.entries()].map(([slug, count]) => ({ value: slug, label: label(slug), count })).sort((a, b) => b.count - a.count),
    languages: [...languages.entries()].map(([name, count]) => ({ value: name, label: name, count })).sort((a, b) => b.count - a.count),
    countries: [...countries.entries()].map(([code, v]) => ({ value: code, label: `${v.flag ?? ''} ${v.name}`.trim(), count: v.count })).sort((a, b) => b.count - a.count),
    regions: [...regions.entries()].map(([name, count]) => ({ value: name, label: name, count })).sort((a, b) => b.count - a.count),
  }
  if (cache.size > 50) cache.clear()
  cache.set(organizationId, { at: Date.now(), data })
  return Response.json(data)
})
