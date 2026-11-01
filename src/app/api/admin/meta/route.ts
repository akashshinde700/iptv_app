import { db } from '@/lib/db'
import { adminRoute } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

/** Dynamic filter options for admin dropdowns — everything from the DB, nothing hardcoded. */
export const GET = adminRoute(async (_request, admin) => {
  const channels = await db.channel.findMany({
    where: { organizationId: admin.organizationId },
    select: { region: true, country: true, countryName: true, languages: true, categories: true },
  })

  const regions = new Set<string>()
  const countries = new Map<string, string>()
  const languages = new Set<string>()
  const categories = new Set<string>()

  for (const channel of channels) {
    if (channel.region) regions.add(channel.region)
    if (channel.country) countries.set(channel.country, channel.countryName ?? channel.country)
    for (const lang of channel.languages.split('|')) {
      if (lang) languages.add(lang)
    }
    for (const cat of channel.categories.split('|')) {
      if (cat) categories.add(cat)
    }
  }

  const sortAlpha = (a: string, b: string) => a.localeCompare(b)
  const countryList = [...countries.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => sortAlpha(a.name, b.name))

  return Response.json({
    regions: [...regions].sort(),
    countries: countryList,
    languages: [...languages].sort(sortAlpha),
    categories: [...categories].sort(sortAlpha),
  })
})
