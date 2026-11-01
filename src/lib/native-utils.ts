/**
 * Pure helpers for the Android shell integration (no Capacitor import, so they are
 * safe on the server and in unit tests). The plugin wrappers live in `native.ts`.
 */

export interface AndroidRelease {
  version: string;
  versionCode: number;
  notes: string[];
  mobile: string;
  tv: string;
}

export interface AppVersionResponse {
  android: AndroidRelease;
}

/** Offer an update when the server has a higher versionCode the user hasn't dismissed. */
export function shouldOfferUpdate(
  installedVersionCode: number,
  latestVersionCode: number,
  dismissedVersionCode: number | null
): boolean {
  if (!Number.isFinite(installedVersionCode) || !Number.isFinite(latestVersionCode)) return false;
  return latestVersionCode > installedVersionCode && dismissedVersionCode !== latestVersionCode;
}

/** TV builds (com.streamkaro.tv) must update from the TV APK, phones from the mobile one. */
export function apkUrlFor(release: AndroidRelease, flavor: "tv" | "mobile"): string {
  return flavor === "tv" ? release.tv : release.mobile;
}

/**
 * ExoPlayer picks HLS/DASH from the URL extension, but our proxy URLs are now opaque
 * (`/api/proxy?t=<encrypted>`) so the upstream URL — and its ".m3u8" — isn't visible. A
 * non-sensitive `k=hls` hint rides on the proxy URL for exactly this. Undefined = let
 * ExoPlayer sniff (progressive: MPEG-TS, MP4, …).
 */
export function guessStreamMimeType(streamUrl: string): string | undefined {
  let target = streamUrl;
  try {
    const u = new URL(streamUrl, "http://local.invalid");
    // Legacy links still carried the upstream URL in ?url=; opaque links use the k= hint.
    if (u.pathname.startsWith("/api/proxy")) {
      if (u.searchParams.get("k") === "hls") return "application/x-mpegURL";
      target = u.searchParams.get("url") ?? streamUrl;
    }
  } catch {
    /* keep the raw string */
  }
  const lower = target.toLowerCase();
  if (lower.includes(".m3u8") || lower.includes("m3u8")) return "application/x-mpegURL";
  if (lower.includes(".mpd")) return "application/dash+xml";
  return undefined;
}
