import type { CapacitorConfig } from "@capacitor/cli";

/**
 * StreamKaro Android shell configuration.
 *
 * Ye APK ek thin WebView shell hai jo aapki deployed StreamKaro website load
 * karta hai — player, channels, sab kuch website se hi aata hai.
 *
 * SETUP (zaroori):
 *   1. Apni StreamKaro website deploy karo (Vercel / VPS — dekho README.md).
 *   2. Neeche `server.url` me apna URL daalo, YA build ke waqt env var do:
 *        STREAMKARO_URL=https://streamkaro.example.com npx cap sync android
 *   3. Android Studio me `android/` folder kholo → Build > Build APK.
 *      (Poori guide: docs/ANDROID_TV_APP.md)
 */
const config: CapacitorConfig = {
  appId: "com.streamkaro.app",
  appName: "StreamKaro",
  webDir: "www",
  server: {
    // Live StreamKaro site — the APK is a thin WebView shell around it.
    url: process.env.STREAMKARO_URL ?? "https://www.streamkaro.aetherdevsolutions.in",
    // kuch IPTV streams http:// par hote hain — mixed content allow
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    // video fullscreen ke liye webview overlays
    backgroundColor: "#09090b",
  },
};

export default config;
