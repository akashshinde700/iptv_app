/**
 * Apple App Site Association — lets https://your-site/... links open in the
 * StreamKaro iOS app instead of Safari (universal links).
 *
 * Served at `/.well-known/apple-app-site-association` through the rewrite in
 * `next.config.ts` (Apple wants that exact path, with `application/json`, no
 * redirects).
 *
 * Setup:
 *   1. Put your Apple Developer Team ID in `APPLE_TEAM_ID` (10 characters).
 *   2. Set `APPLE_BUNDLE_ID` if you changed the bundle id in `ios/xtool.yml`.
 *   3. Add `applinks:<your-domain>` to `ios/Support/StreamKaro.entitlements`
 *      and point `ios/xtool.yml` at it (needs a paid Apple account).
 *
 * Without `APPLE_TEAM_ID` this returns 404 on purpose: an empty association
 * file makes iOS cache "this domain has no app" for hours, which is worse than
 * serving nothing.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_BUNDLE_ID = "com.streamkaro.app";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;

  if (!teamId) {
    return new NextResponse("Universal links are not configured (APPLE_TEAM_ID unset).", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const body = {
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${bundleId}`],
          components: [
            // In-app browsing for everything except the API and the download page.
            { "/": "/watch/*", comment: "Open channels and movies in the app" },
            { "/": "/movies/*", comment: "Movie detail pages" },
            { "/": "/series/*", comment: "Series and episodes" },
            { "/": "/live/*", comment: "Live TV" },
            { "/": "/", comment: "Home" },
            { "/": "/api/*", exclude: true, comment: "API stays in the browser" },
            { "/": "/downloads/*", exclude: true, comment: "APK / installer downloads" },
          ],
        },
      ],
    },
  };

  return NextResponse.json(body, {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
