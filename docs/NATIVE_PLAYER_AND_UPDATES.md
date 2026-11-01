# Native player + in-app updates (Android / Android TV APKs)

Added in APK **0.4.0** (versionCode 3). Ideas adapted from
[SmartTube](https://github.com/yuliskov/SmartTube) (MIT) — no SmartTube code or binaries
are bundled; its YouTube client parts are not used.

## Native player (Media3 ExoPlayer)

| Piece | File |
|---|---|
| Full-screen player | `android/app/src/main/java/com/streamkaro/app/player/PlayerActivity.java` |
| JS bridge (`NativePlayer.play`) | `.../player/NativePlayerPlugin.java` |
| Buffer sizing (RAM / 18, 20–30 s) | `.../player/PlayerTuning.java` |
| Match frame rate (refresh-rate switch) | `.../player/AutoFrameRate.java` |
| Controller UI (D-pad buttons) | `android/app/src/main/res/layout/sk_player_controls.xml` |
| Web side | `src/lib/native.ts`, `src/components/tv/Player.tsx` |

**When it is used**

- Inside the APK on a **TV** → native player by default.
- On a **phone** → web (hls.js) player by default; the error overlay offers "Try native player".
- The user's choice ("Use web player" / "Try native player") is remembered in
  `localStorage["sk-player-engine"]`.
- In a normal browser, or an old 0.3.x APK, nothing changes (plugins are feature-detected).

**Security:** the native player receives the same signed `/api/proxy` URL as the web player,
so portal credentials never reach the device. `ServerOrigin.isTrusted` rejects any URL that
isn't on the shell's own server host.

**Remote controls:** OK/D-pad shows the controls · Back hides them, then exits · Menu key jumps to
the option buttons. Options: Quality / Audio / Subtitles (only when the stream has them),
Zoom (Fit → Zoom → Stretch), Match frame rate (TVs with several display modes, off by default),
Stats (codec, resolution, dropped frames).

**Recovery:** behind-live-window → jump to live edge; network errors / a closed live TS
connection → 3 reconnects with back-off; then the web page shows Retry / Try next source.

## In-app updates

- `GET /api/app/version` → `{ android: ANDROID_RELEASE }` from `src/lib/downloads.ts`.
- `src/components/tv/UpdatePrompt.tsx` (mounted in `AppShell`) compares with the installed
  `versionCode` and offers **Update now / Later** (Later hides that version only).
- `AppUpdaterPlugin.java` downloads the APK for the installed flavor (TV vs mobile) and, before
  opening the system installer, checks: same package name, higher versionCode, same signing
  certificate (API 28+).

### Releasing a new APK

1. Bump **all three** together:
   - `android/app/build.gradle` → `versionCode` (+1) and `versionName`
   - `src/lib/downloads.ts` → `ANDROID_RELEASE` (version, versionCode, notes, file names)
   - `deploy_apps.py` → `APK_VERSION`
2. Build on **this same machine** (the debug keystore in `%USERPROFILE%\.android` signs the
   APKs — an APK signed with a different key cannot update an installed app):
   `cd android && ./gradlew assembleMobileDebug assembleTvDebug` (JDK 21).
3. Copy to `download/` as `StreamKaro-<ver>.apk` and `StreamKaro-TV-<ver>.apk`, then deploy.

> Users on 0.3.x have no updater — they must install 0.4.0 once from the Download page.
>
> Google Play forbids `REQUEST_INSTALL_PACKAGES` for this use: for a Play build remove the
> permission and `AppUpdaterPlugin`, and let Play handle updates.
