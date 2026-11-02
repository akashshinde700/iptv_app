# 7. Desktop Application Audit

Shell: Electron 33 (`desktop/`, a separate npm package) — a `BrowserWindow` around the deployed
site with a preload script, back/F11 handling and an external-link policy.

**Test status:** `BLOCKED` — Electron is not installed here (the desktop folder is its own
package with its own `package-lock.json`) and there is no display server. Static analysis only;
no claim of "verified on Windows/macOS/Linux".

---

## 7.1 Configuration

| Setting | Value | Verdict |
|---|---|---|
| `contextIsolation` | `true` | correct |
| `nodeIntegration` | `false` | correct |
| `preload` | `preload.js` (minimal) | verify it exposes nothing dangerous — it does not |
| `autoplayPolicy` | `no-user-gesture-required` | needed for TV-style playback |
| `webPreferences.webSecurity` | default (`true`) | correct |
| `minWidth/minHeight` | 960×560 | fine |
| Menu | removed (`Menu.setApplicationMenu(null)`) | fine, but removes the native copy/paste accelerators on Windows |
| CSP | none set for the shell | acceptable: content is the remote site, which sets its own headers |

## 7.2 Issues

### DSK-01 · Medium · No auto-update
`electron-builder` is configured for NSIS/dmg/AppImage but there is no `electron-updater`, no
`publish` block and no update channel. Users must re-download the installer, and the app never
tells them a new version exists. Recommended: `electron-updater` with a GitHub/S3 feed, or at
minimum a version check against `/api/app/downloads` (the endpoint added in this audit).

### DSK-02 · Medium · No single-instance lock — **FIXED**
Without `app.requestSingleInstanceLock()` every launch opens another full app (two players, two
audio streams). Fixed in `desktop/main.js`: second launches focus the existing window.

### DSK-03 · Low · Server URL is build-time only
`process.env.STREAMKARO_URL` or the hard-coded default. There is no in-app way to repoint a
shipped installer (the iOS shell has one). Recommended: a small preload-exposed setting stored in
`app.getPath('userData')`.

### DSK-04 · Low · Unsigned installer
`win.signAndEditExecutable: false` → SmartScreen "unknown publisher". Documented in the download
page copy; needs a code-signing certificate to resolve.

### DSK-05 → merged into BUG-03 · Low · Version drift
`desktop/package.json` is `0.4.1` while the product is `0.5.0`. Because the artifact name is
`StreamKaro-Setup-${version}.exe`, the download link built from `APP_VERSION` (0.5.0) can never
exist. Fixed by deriving availability from the server instead of assuming the file name.

### SEC-10 · Low · External-link policy — **FIXED**
`url.startsWith(APP_URL)` allowed `…aetherdevsolutions.in.evil.com` inside the trusted window.
Now compares origins.

## 7.3 Behaviour review

| Area | Finding |
|---|---|
| Window resize / minimise | native, nothing custom to break |
| Fullscreen | F11 handled in `before-input-event` |
| Keyboard | app shortcuts (`/`, Esc, arrows) come from the web app; Electron adds F11/Alt+Left |
| Mouse back button | `app-command: browser-backward` → history back (works with the web app's guard entry) |
| Offline start | `did-fail-load` shows a native Retry/Quit dialog — good |
| Downloads (APK/exe from the site) | Electron's default download behaviour will save the file; no `will-download` handling → no progress UI (low) |
| Printing | not supported (no print menu) — the web app has no print flows, so not a gap |
| Tray | none — reasonable for this product |

## 7.4 What a desktop test must verify (deferred)

1. `cd desktop && npm i && npm start` → window loads the site, playback works.
2. Second launch focuses the first window (new fix).
3. External links open in the system browser; an in-site link stays in-window.
4. `npm run dist:win` → install → SmartScreen path → uninstall leaves no orphan.

Verdict: the security posture of the shell is good (isolation on, node off); it is feature-thin
by design. Auto-update is the one substantive gap.
