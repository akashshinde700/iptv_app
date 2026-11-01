/**
 * App download artifacts. Files live in the deployed `public/downloads/` folder
 * (served at /downloads/…). Update the version + filenames here when a new
 * build is uploaded.
 */
export const APP_VERSION = "0.5.0";

/**
 * Android APK release. Bump together with android/app/build.gradle
 * (versionName / versionCode) and APK_VERSION in deploy_apps.py — installed apps
 * compare `versionCode` via /api/app/version and offer an in-app update.
 */
export const ANDROID_RELEASE = {
  version: "0.4.2",
  versionCode: 5,
  notes: [
    "Back button no longer closes the app while it is starting",
    "Automatic multi-source failover — if one source drops, the channel switches to a backup without interruption",
    "Smarter filters — language and category now combine correctly (e.g. Hindi + Movies), with counts that match your selection",
    "More reliable playlist imports — duplicate entries no longer break a source sync",
    "Stability and playback fixes",
  ],
  mobile: "/downloads/StreamKaro-0.4.2.apk",
  tv: "/downloads/StreamKaro-TV-0.4.2.apk",
};

export interface DownloadTarget {
  id: string;
  platform: string;
  label: string;
  hint: string;
  href: string | null; // null = not built yet
  size?: string;
}

export const DOWNLOADS: DownloadTarget[] = [
  {
    id: "android",
    platform: "Android phone / tablet",
    label: "Android 7.0+ · phones and tablets",
    hint: "APK · sideload (allow “install unknown apps”)",
    href: ANDROID_RELEASE.mobile,
    size: "~8 MB",
  },
  {
    id: "androidtv",
    platform: "Android TV / Fire TV",
    label: "Leanback build — D-pad remote, landscape",
    hint: "APK · sideload via a file manager / USB",
    href: ANDROID_RELEASE.tv,
    size: "~8 MB",
  },
  {
    id: "win",
    platform: "Windows",
    label: "Windows 10 / 11 · 64-bit",
    hint: "Installer (.exe)",
    href: `/downloads/StreamKaro-Setup-${APP_VERSION}.exe`,
    size: "~78 MB",
  },
  {
    id: "ios",
    platform: "iPhone / iPad",
    label: "iOS 17+ · native app",
    // The iOS app lives in ios/ and is built with xtool (no Mac needed).
    // No public .ipa is hosted, so there is nothing to download here — the
    // guide + the PWA route are what a visitor can actually use today.
    hint: "Use Add to Home Screen in Safari — or build the native app from ios/ (docs/IOS_APP.md)",
    href: null,
  },
  {
    id: "mac",
    platform: "macOS",
    label: "macOS (Apple Silicon / Intel)",
    hint: "Coming soon — use the web app or install as a PWA",
    href: null,
  },
  {
    id: "linux",
    platform: "Linux",
    label: "Linux (AppImage)",
    hint: "Coming soon — use the web app or install as a PWA",
    href: null,
  },
];
