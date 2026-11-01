import { ANDROID_RELEASE } from '@/lib/downloads'
import type { AppVersionResponse } from '@/lib/native-utils'

/** Latest sideloadable app builds — polled by the in-app updater in the Android shells. */
export function GET() {
  const body: AppVersionResponse = { android: ANDROID_RELEASE }
  return Response.json(body, { headers: { 'cache-control': 'public, max-age=300' } })
}
