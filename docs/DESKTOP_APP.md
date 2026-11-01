# StreamKaro Desktop App (Windows / macOS / Linux)

> Put StreamKaro in users' taskbars and start menus as a real desktop app. Three options below — **Option A (Electron) is recommended** for a quick, polished ship; Option C costs you zero effort because it already works.

---

## The common prerequisite

All three options are **thin clients around your deployed web app**. So first:

1. Deploy StreamKaro to a production URL (Vercel/VPS/Docker — see `README.md` → Deployment; remember the SQLite caveat → prefer VPS/Docker or migrate to Turso/Postgres).
2. Have that URL handy, e.g. `https://streamkaro.example.com`. Every snippet below says `YOUR_DEPLOYED_URL` — replace it.

---

## Option A — Electron (recommended)

Electron bundles Chromium + Node into a native-feeling desktop app. ~85–120 MB installer, but **total control**: window styling, menu removal, media permissions, auto-update via GitHub Releases, and a code-signing path for every OS.

### A1. Project layout

Create a small folder *outside* the Next.js project (it only needs the wrapper files), or keep it in the repo under `desktop/`:

```
desktop/
├── main.js          # Electron main process
├── preload.js       # (optional) security bridge
├── package.json
└── build/           # icons: icon.ico (Win), icon.icns (mac), icon.png (Linux)
```

### A2. `desktop/package.json`

```json
{
  "name": "streamkaro",
  "productName": "StreamKaro",
  "version": "1.0.0",
  "description": "StreamKaro — 10,000+ free live TV channels",
  "main": "main.js",
  "author": "You <you@streamkaro.example.com>",
  "license": "MIT",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win nsis",
    "dist:mac": "electron-builder --mac dmg",
    "dist:linux": "electron-builder --linux AppImage deb"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.1.8"
  },
  "build": {
    "appId": "com.streamkaro.app",
    "productName": "StreamKaro",
    "directories": { "output": "dist" },
    "files": ["main.js", "preload.js"],
    "windows": {
      "target": [{ "target": "nsis", "arch": ["x64"] }],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "shortcutName": "StreamKaro"
    },
    "mac": {
      "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }],
      "icon": "build/icon.icns",
      "category": "public.app-category.entertainment"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "build/icon.png",
      "category": "Video"
    },
    "publish": {
      "provider": "github",
      "owner": "your-github-username",
      "repo": "streamkaro"
    }
  }
}
```

### A3. `desktop/main.js` (complete, minimal)

```js
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const APP_URL = process.env.STREAMKARO_URL || 'https://YOUR_DEPLOYED_URL.com';

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#09090b',        // match StreamKaro dark theme — no white flash
    autoHideMenuBar: true,             // hide the default File/Edit menu (Alt still reveals it)
    title: 'StreamKaro',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      mediaPermissions: true,          // allow mic/cam prompts (not needed for TV, harmless)
      autoplayPolicy: 'no-user-gesture-required' // live TV starts instantly
    }
  });

  Menu.setApplicationMenu(null);       // fully remove menu bar (Windows/Linux)
  win.loadURL(APP_URL);

  // Open external links (e.g. channel websites) in the system browser, not in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep the title fixed (pages may try to change it)
  win.on('page-title-updated', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

Optional `desktop/preload.js` (kept minimal for security):

```js
// Expose nothing for now. Keeping contextIsolation on and this file tiny
// means future native bridges (e.g. "open in VLC") can be added safely.
window.addEventListener('DOMContentLoaded', () => {});
```

### A4. Icons

Export from `public/icons/icon-512.png` (the master artwork):

- `build/icon.ico` — multi-size 16/24/32/48/64/128/256 px (Windows)
- `build/icon.icns` — macOS (generate with `png2icns` or electron-builder accepts a 512+ px PNG in `mac.icon` and converts)
- `build/icon.png` — 512 px (Linux/AppImage)

### A5. Build & run

```bash
cd desktop
npm install          # or: bun install
npm start            # dev: opens the StreamKaro window

# distributables → desktop/dist/
npm run dist:win     # StreamKaro Setup 1.0.0.exe  (NSIS installer)
npm run dist:mac     # StreamKaro-1.0.0.dmg
npm run dist:linux   # StreamKaro-1.0.0.AppImage + .deb
```

### A6. Code signing notes

| OS | Without signing | With signing |
|---|---|---|
| **Windows** | SmartScreen shows "Unknown publisher — Windows protected your PC" (users can still click *More info → Run anyway*). | EV code-signing certificate (~$200–400/yr, e.g. Certum, Sectigo) removes the warning. Set `"win": { "certificateFile": ..., "certificatePassword": ... }` or use Azure Trusted Signing. |
| **macOS** | Gatekeeper blocks the app: users must right-click → Open (Intel) and arm64 builds may be refused entirely. | Apple Developer Program ($99/yr) + `electron-builder --mac --notarize` with an Developer ID Application cert + notarization = clean double-click install. |
| **Linux** | No signing culture; AppImage runs as-is. `deb` users may see "unverified publisher" — harmless. | Optional GPG signing for apt repo credibility. |

**Budget tip for India:** start unsigned (it costs nothing) and mention in your download page: *"Windows may show a SmartScreen warning — click More info → Run anyway."* Upgrade to EV cert when revenue justifies it.

### A7. Auto-update (free)

Because `publish.provider` is `github` in the builder config, adding [`electron-updater`](https://www.electron.build/auto-update) gives silent updates from GitHub Releases:

```bash
npm i electron-updater
```

```js
// in main.js
const { autoUpdater } = require('electron-updater');
app.whenReady().then(() => autoUpdater.checkForUpdatesAndNotify());
```

Tag a GitHub release (`git tag v1.0.1 && git push --tags`) and `electron-builder` uploads installers; running desktop apps self-update.

---

## Option B — Tauri (smaller, Rust-based)

Tauri uses the OS's native WebView (WebView2 on Windows, WebKit on macOS/Linux) → binaries of **~3–10 MB** instead of ~100 MB. Trade-off: needs the Rust toolchain, and WebKit rendering differences (rare) must be checked.

```bash
# one-time
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
bun add -g @tauri-apps/cli     # or: cargo install tauri-cli
```

```
src-tauri/
├── tauri.conf.json
├── icons/            # tauri icon public/icons/icon-512.png generates all
└── src/main.rs       # scaffolded, keep as-is
```

Key part of `src-tauri/tauri.conf.json`:

```json
{
  "productName": "StreamKaro",
  "identifier": "com.streamkaro.app",
  "build": {},
  "app": {
    "windows": [
      {
        "title": "StreamKaro",
        "url": "https://YOUR_DEPLOYED_URL.com",
        "width": 1280,
        "height": 720,
        "minWidth": 960,
        "minHeight": 540,
        "center": true,
        "decorations": true,
        "resizable": true
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "dmg", "appimage", "deb"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.png"]
  }
}
```

Build: `tauri build` → installers in `src-tauri/target/release/bundle/`.

> Note: because the window URL is remote, Tauri's IPC is untouched — the app is literally a themed shell around your site. This is a fully supported Tauri pattern (`windows[].url`).

---

## Option C — PWA install (zero effort, works today)

The web app is already a **PWA** (manifest + service worker). So on desktop:

- **Chrome/Edge:** visit the site → address-bar install icon, or ⋮ menu → **"Install StreamKaro"** → the site opens in its own window, gets a Start-menu/Taskbar/Dock icon, and runs without browser chrome.
- **End-user cost:** none. **Your cost:** none. Auto-updates are just… website updates.

Why still build Option A/B? Distribution and reach: people on Windows look for an `.exe`, tech channels link installers, and a Play-Store-like listing builds trust. The PWA path is a great *"also installable on any laptop"* line for your site footer.

---

## Distributing your desktop app

1. **Direct download from your website** (best for India — no barriers):
   - Page: `your-site.com/download` with big buttons: *Windows (.exe)* · *macOS (.dmg)* · *Linux (.AppImage)*.
   - Host binaries on Cloudflare R2 / Backblaze B2 (cheap, fast, no egress surprise bills) or GitHub Releases (free).
   - One honest line under the buttons: *"Unsigned build — Windows SmartScreen may warn. Click More info → Run anyway."*
2. **GitHub Releases** (free, reliable, gives you auto-update hosting for Electron):
   ```bash
   gh release create v1.0.0 desktop/dist/*.exe desktop/dist/*.dmg desktop/dist/*.AppImage desktop/dist/*.deb
   ```
3. **Optional later:** Windows winget manifest, macOS Homebrew cask, Flathub — nice-to-haves, skip for v1.

### Caveats recap

- **Windows SmartScreen:** unsigned binaries trigger the warning (see A6). It's a *warning*, not a block.
- **macOS Gatekeeper:** unsigned + un-notarized apps are blocked by default on modern macOS; users must right-click → Open, and this option is disappearing in newer versions. Plan for the $99/yr Apple dev account if Mac users matter to you.
- **Keep the hot-app pattern:** the desktop apps load your deployed site, so bug fixes and new channels reach every desktop user instantly — same benefit as the Android `server.url` approach (see `ANDROID_TV_APP.md` §5).

---

*Related docs: [ANDROID_TV_APP.md](./ANDROID_TV_APP.md) · [MONETIZATION.md](./MONETIZATION.md) · [README.md](../README.md)*
