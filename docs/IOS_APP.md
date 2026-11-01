# StreamKaro for iPhone & iPad (native iOS app)

> A real iOS app — home-screen icon, no Safari chrome, Picture-in-Picture, AirPlay, background
> audio, deep links and offline retry — **built from Linux or Windows with no Mac and no Xcode**.

---

## ⚡ What the app is (60 seconds)

`ios/` is a small SwiftUI app (Swift Package) that loads your **deployed StreamKaro website**
inside a `WKWebView` and wraps it in native iOS behaviour:

| Native thing | Why it matters |
|---|---|
| **Picture-in-Picture** | Leave the app to reply to a message — the channel keeps playing in a floating window. |
| **AirPlay** | Send the match to an Apple TV / AirPlay speaker from the player's AirPlay button. |
| **Background audio** | Audio keeps going when the screen locks (`.playback` audio session + `UIBackgroundModes: audio`). |
| **Keep-awake while playing** | The shell watches the `<video>` elements and disables the idle timer only while something is actually playing — no dead screens, no battery drain. |
| **Landscape** | Rotate for video; browse in portrait. |
| **Left-edge swipe = Back** | Routed to the web app's own Back pipeline (`window.__skBack`), exactly like the Android hardware Back button. |
| **Offline screen** | Instead of Safari's error page: "Can't reach StreamKaro" + Try again + Server settings. |
| **Server settings inside the app** | Repoint the app at a new domain on a phone that is already installed — no rebuild needed. |
| **`streamkaro://` deep links** | `streamkaro://watch/123` opens the channel inside the app. |
| **Share sheet / haptics** | `window.StreamKaroNative.share()` and `.haptic()` are available to the web UI. |

Because the shell loads the website, **every channel, playlist and UI change you deploy ships
instantly** — only changes to the native shell itself need a new build.

> 💡 **Hinglish:** yeh app aapki website ko native iOS app ke andar chalati hai. Channel ya UI
> ka koi bhi update website pe deploy karo — app me turant aa jayega. Sirf native shell
> (PiP, deep links, settings) badalne par naya build chahiye.

### How it relates to the other apps

| Platform | Tech | Folder |
|---|---|---|
| Android / Android TV | Capacitor + WebView | `android/` — see [ANDROID_TV_APP.md](ANDROID_TV_APP.md) |
| Windows / Linux / macOS | Electron | `desktop/` — see [DESKTOP_APP.md](DESKTOP_APP.md) |
| **iOS / iPadOS** | **xtool + SwiftUI + WKWebView** | **`ios/` — this doc** |
| TV browsers, everything else | PWA | `public/manifest.webmanifest` |

> Why not Capacitor for iOS? Capacitor's iOS target needs Xcode (macOS only). xtool builds a
> SwiftPM package with the Darwin Swift SDK and can therefore build+sign+install on Linux and
> Windows — that is the whole point of this folder.

---

## 1. Install the toolchain (one time)

### Linux / WSL2 / Windows

Follow xtool's own guide: **<https://xtool.sh/documentation/xtool/installation-linux>**

Summary of what it does:

```bash
# 1. install xtool (from the guide; it is a single binary)
# 2. let it download the Darwin Swift SDK + iOS support files
xtool setup

# 3. log in with your Apple ID (free account is enough for a device install)
xtool auth
```

You also need (for installing to a physical device):
`libimobiledevice-utils` — `xtool setup` offers to install it, or `apt install libimobiledevice-utils`.

### macOS (optional)

Same commands; `xtool setup` on macOS can reuse an existing Xcode install, and
`xtool dev --simulator` runs the app in the iOS Simulator instead of a device.

### Check your machine

```bash
bun run ios:doctor      # or: bash scripts/ios.sh doctor
```

It reports whether xtool, the Swift toolchain, `libimobiledevice` and a connected device are
ready, and which URL the app will load.

---

## 2. Point the app at your site

Two ways — use either:

1. **Baked in** — `ios/Support/Info.plist` → `StreamKaroBaseURL`
   (default `https://www.streamkaro.aetherdevsolutions.in`). This is what ships in the build.
2. **Per device** — inside the app: **Settings → StreamKaro app → App server → Change**
   (or the **Server settings** button on the offline screen). Stored in `UserDefaults`, so it
   wins over the plist.

> Point it at the **HTTPS** address of your deployment. The shell allows `http` streams for
> web content (`NSAllowsArbitraryLoadsInWebContent`), because plenty of IPTV sources are still
> plain `http`, but your own site should be `https`.

---

## 3. Build, install, run

```bash
cd iptv_app

# plug in the iPhone/iPad, unlock it, tap "Trust"
bun run ios:run                 # = xtool dev  → builds, signs, installs and launches
```

The first build compiles the Swift SDK modules (a few minutes); later builds are seconds.
If iOS asks for **Developer Mode**, enable it in *Settings → Privacy & Security → Developer
Mode*, then run again.

Useful variants:

```bash
bun run ios:doctor                      # environment + device check
xtool devices                           # list connected devices
xtool dev build --ipa --sign            # signed .ipa you can share / sideload
xtool dev build                         # unsigned .app (inspect / re-sign)
xtool dev generate-xcode-project        # open in Xcode later, if you ever want to
```

`xtool dev` installs with a **7-day** provisioning profile on a free Apple ID
(re-signing = just run it again). A paid Developer account gives 1 year.

---

## 4. Project layout

```
ios/
├─ Package.swift                  SwiftPM manifest (library product = the app)
├─ xtool.yml                      bundle id, icon, Info.plist path
├─ AppIcon.png                    1024×1024 icon (see §7)
├─ Support/
│  ├─ Info.plist                  URL, ATS exception, orientations, audio, URL scheme
│  └─ StreamKaro.entitlements     universal links (opt-in, needs a paid account)
└─ Sources/StreamKaro/
   ├─ StreamKaroApp.swift         @main App + AppDelegate (audio session, deep links)
   ├─ RootView.swift              splash, loading bar, offline screen
   ├─ WebContainer.swift          WKWebView + navigation policy + JS bridge + edge swipe
   ├─ Bridge.swift                injected JS API (window.StreamKaroNative) + UIKit actions
   ├─ ServerSettingsView.swift    change the server URL on the device
   └─ AppConfig.swift             URL resolution, version, user-agent
```

`scripts/ios.sh` wraps all the commands, and `docs/` is where this file lives.

---

## 5. What the web app sees

The shell injects a tiny script before the page loads:

```js
window.StreamKaroNative            // object, only inside the iOS app
window.StreamKaroNative.platform   // "ios"
window.StreamKaroNative.share({ url, title })
window.StreamKaroNative.haptic("light" | "medium" | "heavy" | "success" | "warning" | "error")
window.StreamKaroNative.keepAwake(true)
window.StreamKaroNative.openSettings()
document.documentElement.classList.contains("streamkaro-native") // true
navigator.userAgent.includes("StreamKaro-iOS")                   // true
```

In the app code use the typed wrapper instead of touching `window` directly:

```ts
import { getIosShell, shareLink, haptic } from "@/lib/ios-shell";

if (getIosShell()) {
  // iOS-only affordance, e.g. the native share sheet
}
await shareLink({ url, title: "My StreamKaro playlist" }); // native → Web Share → clipboard
haptic("success");
```

`src/lib/platform.ts` treats the iOS shell as a **native shell** (`isNativeShell: true`,
platform `mobile`), so the web UI automatically drops "install our app" nags, skips the service
worker and uses the in-app "Exit StreamKaro?" confirm at the root — the same path as the
Android app.

---

## 6. Universal links (optional, paid Apple account)

`https://your-site/watch/123` opening in the app instead of Safari.

1. **Server** — set `APPLE_TEAM_ID` (10 chars) in your environment and redeploy. The route
   `src/app/apple-app-site-association/route.ts` is served at
   `/.well-known/apple-app-site-association` via a rewrite in `next.config.ts`. Verify:

   ```bash
   curl -s https://your-site/.well-known/apple-app-site-association | jq
   # → { "applinks": { "details": [ { "appIDs": ["TEAMID.com.streamkaro.app"], ... } ] } }
   ```

   Without `APPLE_TEAM_ID` it deliberately returns **404** (an empty association file gets
   cached by iOS for hours and is worse than nothing).

2. **App** — put the domain in `ios/Support/StreamKaro.entitlements`, then add one line to
   `ios/xtool.yml`:

   ```yaml
   entitlementsPath: Support/StreamKaro.entitlements
   ```

   and rebuild with a paid account (`Associated Domains` capability is required).

3. **Install** — delete and reinstall the app on the device (iOS only refreshes the
   association on install / after a while).

`streamkaro://` links work **without** any of this.

---

## 7. Icon, name, version, bundle id

| What | Where |
|---|---|
| Icon | `ios/AppIcon.png` — replace with a **1024×1024** PNG (no transparency). |
| Home-screen name | `CFBundleDisplayName` in `ios/Support/Info.plist` |
| Version | `CFBundleShortVersionString` / `CFBundleVersion` (or `bash scripts/ios.sh version 0.5.1`) |
| Bundle id | `ios/xtool.yml` → `bundleID` (keep it in sync with `APPLE_BUNDLE_ID` if you use universal links) |

> The repo currently ships the 512 px app icon scaled into `AppIcon.png`. Swap in the 1024 px
> export before any App Store submission.

---

## 8. Sideloading & distribution — what is actually possible

| Route | Possible? | Notes |
|---|---|---|
| **Install on your own device from Linux/Windows** | ✅ | `xtool dev` — signs with your Apple ID (7 days free / 1 year paid) |
| **Share a signed `.ipa` with testers** | ⚠️ | Testers must add their device UDID to your account; xtool signs per device (`xtool ds devices list`) |
| **TestFlight / App Store** | ❌ from this repo | Uploading a build needs Apple's tooling (Transporter / `altool` on macOS). Use `xtool dev generate-xcode-project` on a Mac, or archive the `.ipa` in Xcode's Transporter app. |
| **Add to Home Screen (PWA)** | ✅ today | Safari → Share → *Add to Home Screen*. The site already ships `appleWebApp` metadata, an apple-touch-icon and a manifest. |

**App Store review reality check:** an app whose only content is a wrapped website is
rejected under **guideline 4.2 (minimum functionality)** unless it adds native value. This
shell does add some (PiP, AirPlay, deep links, offline retry, native share/settings), but be
honest about the model: the safest path to the App Store is a build that exposes real native
features per platform rather than a pure web wrapper. Also, IPTV content must be one you have
the rights to distribute — Apple asks about that explicitly (guideline 5.2.3).

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `xtool: command not found` | Re-run the install step from xtool.sh, then open a new shell. |
| `Cannot find iDevice` / "Waiting for device" | Unlock the phone, tap **Trust**, `apt install libimobiledevice-utils`, try another cable/port (data, not charge-only). |
| `Developer Mode disabled` | iOS *Settings → Privacy & Security → Developer Mode → on*, reboot, run again. |
| App opens to "Can't reach StreamKaro" | The URL in Settings is wrong or the server is down. Long-press nothing — just tap **Server settings**. |
| Video plays but no PiP button | PiP needs the video to be playing and inline-capable; Safari-based PiP is unavailable for some DRM-free `blob:` sources. Try the fullscreen button first. |
| White screen, no error | `xtool dev --verbose`, or check the log in Console on a Mac. Usually a build with a stale `.build/` — `rm -rf ios/.build`. |
| Universal links open Safari | Association file 404 (set `APPLE_TEAM_ID`), entitlement missing, or the app was installed before the file existed — reinstall. |
| App feels like a website | That is the design: the web app *is* the product. Install the PWA or wait for the native player work in `docs/NATIVE_PLAYER_AND_UPDATES.md`. |

---

## 10. Updating the app

- **Content / channels / UI** → deploy the website. Nothing else to do.
- **Native shell changes** (PiP, deep links, settings, icon) → bump the version, rebuild:
  ```bash
  bash scripts/ios.sh version 0.5.1
  bun run ios:ipa
  ```
- Keep `src/lib/downloads.ts` (`APP_VERSION`) and `ios/Support/Info.plist`
  (`CFBundleShortVersionString`) in step with `package.json`.

---

## Credits

- [xtool](https://github.com/xtool-org/xtool) — cross-platform Xcode replacement (MIT).
- UX inspiration for the shell (native-feeling player, resume + history, quality picker,
  playlist import): [MovieBox-Tui](https://github.com/mesamirh/MovieBox-Tui).
