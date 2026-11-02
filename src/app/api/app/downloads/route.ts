import { stat } from 'node:fs/promises'
import path from 'node:path'
import { APP_VERSION, DOWNLOADS } from '@/lib/downloads'

/**
 * Which download links actually point at a file.
 *
 * The download page used to render a live "Download" button for every platform in `DOWNLOADS`,
 * including the APK and the Windows installer — but binary artifacts are never committed to git,
 * so on a fresh deployment every one of those buttons was a 404 and looked like a broken site.
 *
 * This endpoint answers the only question the UI needs: is the file really there? It stats the
 * file at request time (cheap, and cached briefly) rather than trusting a hardcoded list, so the
 * page is correct the moment an operator uploads an artifact — and honest when they have not.
 */
export const dynamic = 'force-dynamic'

export interface DownloadAvailability {
  id: string
  href: string | null
  available: boolean
  sizeBytes: number | null
}

async function fileSize(href: string): Promise<number | null> {
  // Only same-origin artifacts under /downloads can be verified; anything else is trusted as
  // configured (e.g. an external CDN URL an operator sets deliberately).
  if (!href.startsWith('/downloads/')) return null
  try {
    const file = path.join(process.cwd(), 'public', ...href.split('/').filter(Boolean))
    const info = await stat(file)
    return info.isFile() && info.size > 0 ? info.size : null
  } catch {
    return null
  }
}

export async function GET() {
  const targets: DownloadAvailability[] = await Promise.all(
    DOWNLOADS.map(async (target) => {
      if (!target.href) return { id: target.id, href: null, available: false, sizeBytes: null }
      const sizeBytes = await fileSize(target.href)
      return {
        id: target.id,
        href: target.href,
        available: target.href.startsWith('/downloads/') ? sizeBytes !== null : true,
        sizeBytes,
      }
    }),
  )

  return Response.json(
    { version: APP_VERSION, generatedAt: new Date().toISOString(), targets },
    { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
  )
}
