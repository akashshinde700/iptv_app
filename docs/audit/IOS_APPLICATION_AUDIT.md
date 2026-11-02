# 6. iOS Application Audit

Shell: `ios/` — a SwiftPM SwiftUI package built with **xtool** (no Xcode, no Mac required),
wrapping the deployed site in `WKWebView`.

**Test status:** `BLOCKED` — this sandbox has no Swift toolchain and no Darwin SDK, so the app was
never compiled here. Everything below is static analysis plus the parts that *are* executable:
the injected JavaScript was syntax-checked with `node --check`, and the web-side bridge
(`src/lib/ios-shell.ts`, `platform.ts`, `QueueView` integration) is covered by Vitest.
Nothing on this platform is claimed as "tested on device or simulator".

---

## 6.1 Shell features (implemented)

| Feature | Implementation | Risk if untested |
|---|---|---|
| Inline video + Picture-in-Picture | `allowsInlineMediaPlayback`, `allowsPictureInPictureMediaPlayback`, `isElementFullscreenEnabled` | PiP availability depends on the media type; needs a real device check |
| AirPlay | `AVAudioSession .playback` + `allowAirPlay` | shows in the system picker only when a route exists |
| Background audio | `UIBackgroundModes: audio` + audio session | App Review may ask why; justified |
| Keep-awake | injected script watches `<video>` play/pause → `isIdleTimerDisabled` | no test possible here |
| Landscape | `UISupportedInterfaceOrientations` incl. both landscapes | fine |
| Edge-swipe Back | `UIScreenEdgePanGestureRecognizer` → `window.__skBack()` | gesture conflicts with WKWebView scrolling on the left edge — needs device check |
| Offline/error screen | `WKNavigationDelegate` error mapping → native retry UI | needs a device check |
| Server override | `UserDefaults` + settings sheet | covered by type-level review only |
| Deep links | `streamkaro://<path>` → in-app navigation | **was broken** (IOS-01) |
| Share / haptics | `window.StreamKaroNative` bridge | web-side covered by unit tests |

## 6.2 Issues

### IOS-01 · High · Deep links pointed at routes that did not exist
`streamkaro://watch/<id>` and universal links map to `/watch/<id>`, but the web app had no such
route, so the app opened onto the site's 404. The AASA file even advertised `/watch/*`,
`/movies/*`, `/series/*`, `/live/*`. **Fixed** together with BUG-02: a catch-all route now boots
the app on the right screen, and the AASA component list matches the real paths.

### IOS-02 · Medium · ATS exception must be justified
`NSAllowsArbitraryLoadsInWebContent = true` exists because IPTV streams are frequently plain
`http`. App Review accepts this with a written justification (web content only, no native API
calls over http). Action: keep the comment in `Info.plist`, mention it in the review notes.
Not fixable in code without breaking playback.

### IOS-03 · Medium · No offline cache
The shell is a live web view: a network drop shows the native retry screen and a full reload
follows. On a phone in a lift this is a visible "app restart". Recommended: `WKWebsiteDataStore`
persistence (already default) plus a small `URLCache` policy for the shell's own assets; full
offline playback is out of scope.

### IOS-04 · Low · Icon resolution
`ios/AppIcon.png` is the 512 px master upscaled. App Store requires 1024×1024 without alpha.

### IOS-05 · Low · Server override accepted `http://`
A storefront URL entered as `http://…` would run the whole app in cleartext. **Fixed:** the
override now requires `https` (localhost excepted for development).

### IOS-06 · Medium · No push notifications
No APNs integration, so "your plan expires tomorrow" cannot reach the user. Listed as a gap, not
a regression; needs an Apple Developer account to even configure.

## 6.3 App Store readiness

| Requirement | Status |
|---|---|
| Guideline 4.2 (minimum functionality) | **At risk** — a web wrapper needs native value. PiP, AirPlay, background audio, share sheet and offline retry help; the honest recommendation is to keep the native player work (`docs/NATIVE_PLAYER_AND_UPDATES.md`) on the roadmap. |
| Guideline 2.5.1 (apps may not quit themselves) | Handled — the exit dialog explains swiping up instead of calling `exit(0)`. |
| Guideline 5.2.3 (content rights) | Operator responsibility; documented. |
| Signing / distribution | Sideload with a free Apple ID works; TestFlight/App Store needs macOS tooling. Documented in `docs/IOS_APP.md` §8. |
| Privacy manifest (iOS 17) | **Missing** — `PrivacyInfo.xcprivacy` is required for API usage declarations (UserDefaults is a covered API). Must be added before submission. |

## 6.4 What a device test must verify (deferred)

1. `bash scripts/ios.sh run` → install on an iPhone; confirm splash → site → login.
2. PiP while switching apps; AirPlay to a device; audio continues with the screen locked.
3. Left-edge swipe back from a channel; rotation during playback.
4. Airplane mode → native retry screen → back online.
5. `streamkaro://watch/<id>` from Safari and from a QR code (cold start and warm start).
6. Universal links after setting `APPLE_TEAM_ID` + the entitlement.

Verdict: the shell's design is sound and the JS bridge is tested; the compile and device
behaviour remain unverified here and must be treated as such until `xtool dev` runs on a machine
with the toolchain.
