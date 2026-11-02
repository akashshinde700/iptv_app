# 5. Android Application Audit

Shell: Capacitor 8 (`android/`), a WebView around the deployed site plus three native plugins
(`NativePlayer` = Media3, `AppUpdater`, `Shell`).

**Test status:** `BLOCKED` for runtime testing — this sandbox has no Android SDK, no Gradle
toolchain and no emulator/device. Everything below is static analysis of
`android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, the Java/Kotlin sources
and the web-side bridge (`src/lib/native.ts`). No APK was built or installed; nothing on this
platform is claimed as "tested on device".

---

## 5.1 Manifest & configuration

| Check | Result |
|---|---|
| Launcher | `MainActivity` exported with LAUNCHER intent filter |
| Android TV | `LEANBACK_LAUNCHER` filter + `uses-feature leanback(required=false)` + `banner` drawable |
| Touchscreen optional | `uses-feature touchscreen(required=false)` — required so TV boxes can install |
| Orientation | `fullSensor` — the player itself forces landscape |
| Cleartext | `usesCleartextTraffic="true"` (needed: many IPTV sources are `http://`) — **AND-03** |
| Backup | `allowBackup="true"` — **AND-02** |
| FileProvider | declared, `exported=false`, `grantUriPermissions=true` (used by the updater) |
| Permissions | `INTERNET`, `WAKE_LOCK`, `REQUEST_INSTALL_PACKAGES` (sideload updates) |
| Player activity | `exported=false`, `sensorLandscape` — correct |
| appId (TV flavour) | `com.streamkaro.tv` (mobile stays `com.streamkaro.app`) |

## 5.2 Update pipeline

```
AppUpdater.getInfo()  → installed versionName/versionCode
UpdatePrompt.tsx      → GET /api/app/version → shouldOfferUpdate(installed, remote)
                      → opens /downloads/StreamKaro-<v>.apk (or -TV-)
```

Defects:

1. **AND-01 (High)** `versionName 0.4.2 / versionCode 5` in Gradle while the product is 0.5.0.
   The comparison therefore always says "up to date".
2. **BUG-03 (High)** the advertised APK is not present in `public/downloads/` on a fresh deploy
   → the updater downloads a 404 HTML page and the install fails silently (`ACTION_VIEW` on a
   non-APK). Fixed by the new availability endpoint, which makes the prompt only appear when the
   file actually exists.
3. **AND-04 (Medium)** no hash/signature verification of the downloaded APK before
   `installPackage`. Over HTTPS the transport is protected, but a compromised host or a stale CDN
   could serve tampered code. Recommended: publish `sha256` next to the artifact and verify.

## 5.3 WebView bridge

| Bridge | Direction | Verified |
|---|---|---|
| `window.__skBack` | native → web | `MainActivity` Back dispatches; web returns `handled/unhandled` so the app only exits when the web stack is empty |
| `NativePlayer.play()` | web → native | passes URL, headers, UA, cookies; returns a result |
| `AppUpdater.install()` | web → native | downloads + opens the installer |
| `Shell.exitApp()` | web → native | used by the in-app "Exit?" confirm |

Issues: none in the contract. `hasNativePlugin()` is guarded by `Capacitor.isNativePlatform()`,
so a browser build never calls a missing plugin — good.

## 5.4 Behavioural risks (static analysis)

| Area | Finding |
|---|---|
| Back on Home | asks "Exit StreamKaro?" — correct Android convention |
| Lifecycle | video pauses in background; the watchdog is JS-side and resumes on `online` |
| Offline | `OfflineBanner` + player retry; no native offline cache (same as iOS) |
| Keyboard | no text-input screens except login/search — default resize behaviour is fine |
| Memory | the WebView is recreated on cold start only; no leak sources found in the plugin code |
| Screen sizes | layouts are Tailwind responsive; TV mode scales via `html.tv-mode` |
| Notifications | none (no APNs/FCM) — not required for the current feature set |
| Camera/storage | camera unused; storage only via the updater FileProvider |

## 5.5 What a device test must verify (deferred)

1. `bun run cap:sync android` then build → install on a phone **and** a TV box.
2. D-pad traversal on Home → Channels → Player; Back from every screen.
3. In-app update: bump `versionCode`, publish an APK, confirm the prompt and the install.
4. Rotate during playback; leave the app mid-video and return.
5. Kill the network mid-playback and restore it.

Verdict: shell code is sound and the manifest is correct for phones and TV. Two release-blocking
issues (version bump, missing artifact) are process bugs, not code bugs; both are addressed on
the web side of the pipeline in this audit, and the Gradle bump is scheduled in the roadmap.
