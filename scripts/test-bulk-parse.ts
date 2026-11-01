/* Quick parser sanity test against real credential dumps. */
import { readFileSync } from 'node:fs'
import { parseBulkText } from '../src/lib/server/bulk-import'

const blob1 = readFileSync('/home/z/my-project/upload/bulk-paste-1.txt', 'utf8')
const blob2 = readFileSync('/home/z/my-project/upload/m3u.txt', 'utf8')

for (const [name, text] of [['bulk-paste-1', blob1], ['m3u.txt', blob2]] as const) {
  const r = parseBulkText(text)
  console.log(`\n=== ${name} ===`)
  console.log('stats:', r.stats, 'skippedLines:', r.skippedLines)
  const stalker = r.entries.filter((e) => e.type === 'STALKER')
  const xtream = r.entries.filter((e) => e.type === 'XTREAM')
  const m3u = r.entries.filter((e) => e.type === 'M3U_URL')
  console.log('XTREAM entries:')
  for (const e of xtream) console.log(`  ${e.name} | ${e.url} | ${e.username} | exp=${e.expiresAt?.toISOString().slice(0, 10) ?? '—'}`)
  console.log('M3U entries:', m3u.map((e) => e.name).join(', ') || '—')
  console.log(`STALKER: ${stalker.length} entries, hosts: ${[...new Set(stalker.map((e) => e.url))].join(', ')}`)
  const withExpiry = stalker.filter((e) => e.expiresAt)
  console.log(`STALKER with expiry: ${withExpiry.length}/${stalker.length}`)
  console.log('sample stalker:', stalker.slice(0, 4).map((e) => `${e.name} ${e.macAddress} exp=${e.expiresAt?.toISOString().slice(0, 10) ?? '—'}`))
  const expired = stalker.filter((e) => e.expiresAt && e.expiresAt.getTime() < Date.now()).length
  console.log(`already-expired entries: ${expired}`)
}
