# StreamKaro Android + Android TV App (Capacitor Guide)

> Ship StreamKaro as a **real Android app** — installable on phones, tablets and **Android TV** — without rewriting a single line of your Next.js code.

---

## ⚡ Fast Path — the `android/` project is ALREADY generated!

You don't need to run the setup steps below from scratch — this repo already contains a ready Capacitor setup:

- ✅ `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` installed
- ✅ `capacitor.config.ts` (web shell pointing at your deployed URL)
- ✅ `android/` native project generated (Capacitor 8)
- ✅ **Android TV ready:** `LEANBACK_LAUNCHER` intent filter, leanback + non-touchscreen `uses-feature`, TV banner at `android/app/src/main/res/drawable-xhdpi/banner.png`, cleartext traffic enabled
- ✅ Scripts: `bun run cap:sync` / `bun run cap:open`

**Only 3 steps remain:**

```bash
# 1. Set your deployed website URL (edit capacitor.config.ts → server.url,
#    or use the env var):
STREAMKARO_URL=https://your-site.example.com npx cap sync android

# 2. Open in Android Studio (installs Gradle wrapper automatically):
bun run cap:open        # or: npx cap open android

# 3. In Android Studio: Build ▸ Build App Bundle(s)/APK(s) ▸ Build APK(s)
#    → app/build/outputs/apk/debug/app-debug.apk
#    Copy that APK to a pendrive → install on Android TV (steps in §8).
```

> 💡 APK ko pendrive se install karne ke TV-wale steps is file ke **§8 (Install via pendrive)** me hain, aur app ke andar **"TV pe kaise?"** button me bhi.

---

## 1. Why Capacitor?

[Capacitor](https://capacitorjs.com/) (by the Ionic team) wraps your existing web app inside a **native Android shell** — a `WebView` with superpowers. For StreamKaro this is the perfect fit because:

| Benefit | What it means for you |
|---|---|
| **Same codebase** | Your Next.js app (10,000 channels, HLS player, favorites, Premium page) runs unchanged inside the APK/AAB. |
| **Play Store distribution** | Publish an `.aab` on Google Play — the #1 way Indian users discover and trust an app. |
| **Android TV for free** | Add a few manifest entries and StreamKaro appears in the Android TV launcher (leanback). |
| **Native plugins when needed** | AdMob, push notifications, deep links, status-bar control — all via first-party/community plugins. |
| **The "hot" update approach** | By pointing the WebView at your **deployed website URL**, every content fix, new channel, or UI tweak goes live instantly — **no Play Store review needed** for content changes. |

> 💡 **Hinglish tip:** Capacitor soch-ne ka nahi, sirf wrap karne ka kaam karta hai — aapki web app waise ki waisi chalegi, bas ek app icon ke andar.

---

## 2. Prerequisites (one-time setup)

Install these on your build machine (Windows/macOS/Linux):

1. **Node.js 18+** and **Bun** (you already use Bun for the web app).
2. **Android Studio** — <https://developer.android.com/studio> (includes the Android SDK, emulator, and SDK Manager).
3. **JDK 17** — required by current Android Gradle Plugin. Android Studio bundles one (JetBrains Runtime), or install Temurin 17.
4. **Android SDK** — from Android Studio → *Settings → Languages & Frameworks → Android SDK*, install:
   - Android SDK Platform **34** (or latest)
   - SDK Build-Tools, SDK Platform-Tools, SDK Command-line Tools
5. Set environment variables (example for Linux/macOS; on Windows use System Properties):

```bash
export ANDROID_HOME=~/Android/Sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)   # macOS; on Linux point to your JDK 17 path
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
```

Verify: `sdkmanager --version`, `java -version`, `adb version`.

---

## 3. Step 0 — Deploy the web app first (recommended)

Capacitor will load StreamKaro from a URL, so you need the web app live:

- **Option A (recommended): Deploy to Vercel** or any Node host (see `README.md` → Deployment). You get HTTPS, CDN, and auto-deploys from git.
  - ⚠️ **Important:** the app uses **SQLite via Prisma** (`db/custom.db`) — this does **not** work on Vercel's serverless filesystem. See the README's *Deployment* section: either run on a VPS/Docker, or migrate to Turso/Postgres first.
- **Option B (development only):** run `bun run dev` on your PC and point the app at `http://<your-lan-ip>:3000` with `cleartext: true` for quick testing on a real device.

You should have a stable production URL, e.g. `https://streamkaro.example.com`.

---

## 4. Install Capacitor

From the project root (`/home/z/my-project`):

```bash
bun add @capacitor/core @capacitor/android
bun add -d @capacitor/cli
```

> Do **not** add `@capacitor/ios` unless you plan an iOS build later.

---

## 5. `npx cap init` and the web-dir strategy

```bash
npx cap init StreamKaro com.streamkaro.app --web-dir=www
```

- `appId` = `com.streamkaro.app` (permanent unique ID on the Play Store — choose carefully, it **cannot be changed after publishing**).
- `appName` = `StreamKaro` (shown under the icon).
- `webDir` = the folder of **static web assets** Capacitor copies into the APK.

### Which web-dir strategy to choose?

| Strategy | How | Pros | Cons |
|---|---|---|---|
| **A. Remote URL (hot app) — recommended** | `webDir` points to a tiny static stub folder (`www/` with just a redirect/loading page); the real UI is loaded from your deployed URL via `server.url` | Content changes ship instantly without app updates; APK stays ~2 MB; one source of truth | Needs network on first launch; Play Store reviewers must see real functionality (they will — it loads your site) |
| **B. Fully bundled (cold app)** | Run `next build && next export`-style static output into `www/` | Works offline on first open | **Not viable** for StreamKaro: you need the Node server (`/api/*`, `/api/proxy`) for channel data and HLS proxying — a static bundle alone can't provide that |

Because StreamKaro depends on server routes (`/api/proxy`, channel APIs) and Prisma/SQLite, **Strategy A is the only practical choice**, and it's also the most convenient for you.

Create the stub folder:

```bash
mkdir -p www
cat > www/index.html <<'EOF'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>StreamKaro</title>
  <style>
    html,body{height:100%;margin:0;background:#09090b;color:#f59e0b;
      display:grid;place-items:center;font-family:system-ui,sans-serif}
  </style>
  <script>
    // Falls back gracefully if the remote site is unreachable
    setTimeout(function(){ document.body.textContent = "Connecting to StreamKaro… Check your internet."; }, 3000);
    location.replace("https://your-deployed-url.com"); // <-- CHANGE ME
  </script>
</head>
<body></body>
</html>
EOF
```

### `capacitor.config.ts` (project root)

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.streamkaro.app',
  appName: 'StreamKaro',
  webDir: 'www',
  server: {
    // 🔥 "Hot app" approach: the WebView loads your LIVE deployed site.
    // Update the website → every installed app shows the new version
    // immediately, no Play Store update required for content/UI changes.
    url: 'https://your-deployed-url.com',   // <-- your production URL
    androidScheme: 'https',                 // WebView treats content as https:// origin
    cleartext: false,                       // block plain http:// (Play Store friendly)
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#09090b',             // match the dark theme (no white flash)
  },
};

export default config;
```

**Notes**

- `androidScheme: 'https'` makes the WebView origin `https://appassets.androidplatform.net`, so cookies/localStorage/fetch behave like a normal secure site.
- `cleartext: false` keeps HTTPS-only. Only flip to `true` temporarily while testing against `http://192.168.x.x:3000` on LAN.
- ⚠️ If you also enable `capacitor` live-update plugins later, remove `server.url` conflicts — one source at a time.

### Why the hot approach wins for StreamKaro

- You fixed a broken channel source? Push to main → Vercel deploys → **all Android users get it instantly**.
- AdSlot changes, Premium pricing, new categories, SEO tweaks — all server-side, zero app updates.
- Play Store updates (a 1–3 day review cycle) are then reserved for *native* changes only: icon, AdMob SDK version, permissions.

---

## 6. Add the Android platform & run

```bash
npx cap add android        # creates the android/ native project
npx cap sync               # copies www/ + config into android/ (re-run after config changes)
bun run cap:open           # or: npx cap open android  → opens Android Studio
```

Run on a device/emulator from Android Studio (▶), or:

```bash
cd android && ./gradlew assembleDebug
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Add these convenience scripts to `package.json` (optional):

```json
{
  "scripts": {
    "cap:sync": "npx cap sync android",
    "cap:open": "npx cap open android",
    "cap:apk": "cd android && ./gradlew assembleDebug"
  }
}
```

---

## 7. Android TV support 📺

Android TV uses the **Leanback** launcher. A phone APK will not show up on the TV home screen until you declare it. Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- TV: app is usable on leanback devices, but NOT TV-only (phones still fine) -->
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <!-- TV remotes have no touchscreen -->
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />

    <application
        android:label="StreamKaro"
        android:icon="@mipmap/ic_launcher"
        android:banner="@drawable/tv_banner"
        android:screenOrientation="landscape"
        ...>

        <!-- Existing phone launcher intent-filter stays -->

        <!-- ADD: appear in the Android TV launcher -->
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
        </intent-filter>

        <activity
            android:name=".MainActivity"
            android:screenOrientation="landscape"
            ... />
    </application>
</manifest>
```

What each piece does:

| Entry | Purpose |
|---|---|
| `<uses-feature android:name="android.software.leanback" android:required="false" />` | "I support TV" — without `required="false"` the app would be excluded from phones. |
| `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />` | TV has no touchscreen; without this the Play Store hides the app from TV devices. |
| `<category android:name="android.intent.category.LEANBACK_LAUNCHER" />` | Adds the icon to the TV Apps row. |
| `android:banner="@drawable/tv_banner"` | Wide artwork shown on the TV home screen. |
| `android:screenOrientation="landscape"` | TVs are always landscape; locking avoids orientation flip bugs when video goes fullscreen. |

### TV banner asset

- Size: **320 × 180 px** PNG, no transparency needed, brand-safe padding (icon/text ≥ 15% from edges).
- Place it at:

```
android/app/src/main/res/drawable-xhdpi/tv_banner.png
```

- Use the amber/orange StreamKaro brand on the dark `#09090b` background — it reads well on TV home screens.

### D-pad / remote navigation

Good news: the web app already ships **focus-visible D-pad friendly styles** — every card, filter and button shows a clear focus ring when navigated with arrow keys, so the TV remote (which emulates arrow keys + Enter) works out of the box. When testing on TV, verify:

1. Focus ring is visible on the selected channel card.
2. `OK` on remote opens the watch view; `Back` returns to the grid.
3. The HLS video player receives focus for play/pause via remote media keys.
4. Text search with remote typing works (consider a "Popular searches" chip row to reduce typing pain — huge UX win on TV).

---

## 8. Build a debug APK

```bash
npx cap sync
cd android
./gradlew assembleDebug          # Windows: gradlew.bat assembleDebug
```

APK output:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install on a phone/TV over ADB: `adb install app-debug.apk`. Side-loading tip for Indian users: this debug APK is what you can share on WhatsApp/Telegram groups for beta testing — but for the Play Store you need a signed **AAB** (next section).

---

## 9. Release build (signed AAB for Google Play)

### 9.1 Generate a keystore (one time — BACK IT UP!)

```bash
keytool -genkey -v \
  -keystore streamkaro-release.keystore \
  -alias streamkaro \
  -keyalg RSA -keysize 2048 -validity 10000
```

You'll be prompted for a keystore password and an alias password. **Losing this file = losing the ability to update your app on the Play Store, forever.** Store it in a password manager + cloud backup. Do **not** commit it to git (add `*.keystore` to `.gitignore`).

### 9.2 Wire the signing config

`android/key.properties` (git-ignored):

```properties
storeFile=../../streamkaro-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=streamkaro
keyPassword=YOUR_KEY_PASSWORD
```

In `android/app/build.gradle`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
        }
    }
}
```

### 9.3 Build the bundle

```bash
cd android
./gradlew bundleRelease
```

Output AAB (upload this to Play Store):

```
android/app/build/outputs/bundle/release/app-release.aab
```

(If you also want a shareable signed APK: `./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`.)

---

## 10. Google Play listing checklist

- [ ] **App name:** `StreamKaro — Free Live TV` (≤ 30 chars).
- [ ] **Short description** (≤ 80 chars): e.g. "Watch 10,000+ free live TV channels from around the world. News, movies, sports."
- [ ] **Full description** with keywords people search: *live TV, free channels, Hindi news, IPTV player*.
- [ ] **App category:** Entertainment. Tags: Live TV / Video players.
- [ ] **Phone screenshots:** 2–8 images, min 320 px, max 3840 px, 16:9 or 9:16. Capture: home grid, browse filters, watch page with player.
- [ ] **TV screenshots:** Google requires **TV-specific screenshots** if you opt into Android TV: at least 1 (recommend 4) images in **16:9, min 1920 × 1080 px**, showing the TV UI (grid + focused card + player). These differ from phone shots — take them in the TV emulator.
- [ ] **Feature graphic:** 1024 × 500 PNG (used in Play Store header).
- [ ] **TV banner:** the `tv_banner.png` you made above (Play Console asks for it under "Android TV" tab).
- [ ] **Privacy policy URL — REQUIRED.** Google Play rejects apps without a working privacy policy, and yours collects nothing but should still disclose ads/analytics. Host it on your site (e.g. `https://your-site.com/privacy`) and paste the URL in Play Console → App content → Privacy policy.
- [ ] **Content rating questionnaire** (IAB): answer honestly — user-generated content: no; ads: yes (if using AdMob); the app aggregates third-party public streams. Expect rating ≈ Everyone/Teen.
- [ ] **Data safety form:** declare what you collect (likely "none" or just analytics + advertising IDs if AdMob). Advertising ID usage **must** be declared when you integrate AdMob.
- [ ] **Target audience:** 13+ (simpler review path; avoids Families policy requirements).
- [ ] **App access:** all functionality is free, no login needed — say so.
- [ ] **Countries:** start with India + a few others; expand later.
- [ ] **Release:** start on *Internal testing* track, then *Closed testing* (20 testers for 14 days is no longer mandatory for personal accounts created after Nov 2023, but 12+ testers for closed testing is required for new personal developer accounts before production) — check current Play Console rules when you publish.

> 💡 New Play developer account = one-time **$25** fee. First app review can take up to 7 days.

---

## 11. Optional Android-native niceties

### AdMob (native ads for the Android build)

Web AdSense doesn't work reliably inside Android WebViews, so use **AdMob** on Android via the community plugin:

```bash
bun add @capacitor-community/admob
npx cap sync
```

```ts
import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';

await AdMob.initialize({ initializeForTesting: false });
await AdMob.showBanner({
  adId: 'ca-app-pub-XXXX/YYYY',        // your AdMob banner unit
  adSize: BannerAdSize.ADAPTIVE_BANNER,
  position: BannerAdPosition.BOTTOM_CENTER,
});
```

Tips:

- Gate it: only run on Android (`Capacitor.isNativePlatform()`), keep web on AdSense.
- Show banner on browse/home; **never** overlay ads on the video player.
- Start with **test ad unit IDs** — real IDs with accidental clicks get AdMob accounts banned.
- Link AdMob ↔ AdSense ↔ Play Console under one Google account for unified earnings.

### Keep-in-front HLS fullscreen

Some Android WebView versions drop fullscreen video when the app loses/regains focus (e.g. incoming call). If you see the player exit fullscreen, enable the keep-screen-on + fullscreen flags in `MainActivity.java`:

```java
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }
}
```

And in the web player, re-attach the fullscreen listener on `visibilitychange` (already worth having for mobile web too).

### Hardware back button

The Android back gesture/button will exit the app abruptly unless handled. In the web app, listen to Capacitor's back event (add to the app entry, web-safe):

```ts
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    // else: let the default happen (exit), or show "Press back again to exit"
  });
}
```

Hook it into your Zustand view state: if the watch view is open → close it; if filters are open → close them; else exit. Small touch, feels *native*.

---

## 12. App icon guidance

- Source artwork: **`public/icons/icon-512.png`** — use this as the master for everything.
- Generate all Android densities without thinking: in Android Studio, right-click `res` → *New → Image Asset* → choose your 512 px PNG → it produces adaptive icons (foreground + background layers) for all buckets (`mipmap-mdpi` … `mipmap-xxxhdpi`).
- Adaptive icon design: put the StreamKaro mark on a **solid dark (#09090b) or amber** background layer; keep the logo within the safe zone (66% center circle) since masks vary (circle/squircle).
- Play Store listing icon is separate: **512 × 512** 32-bit PNG — reuse the same source.
- TV banner is covered in §7.

---

## 13. Command summary (cheat sheet)

```bash
# one-time
bun add @capacitor/core @capacitor/android && bun add -d @capacitor/cli
npx cap init StreamKaro com.streamkaro.app --web-dir=www
npx cap add android

# after any capacitor.config.ts / www/ change
npx cap sync

# debug
cd android && ./gradlew assembleDebug

# release
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

---

*Related docs: [DESKTOP_APP.md](./DESKTOP_APP.md) · [MONETIZATION.md](./MONETIZATION.md) · [README.md](../README.md)*
