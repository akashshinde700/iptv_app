"use client";

import { Capacitor } from "@capacitor/core";
import type { Platform } from "@/lib/store";

const TV_UA =
  /smart[- ]tv|smarttv|tizen|webos|web0s|hbbtv|netcast|bravia|google[- ]?tv|android[- ]?tv|fire[- ]?tv|\baft[a-z]{1,4}\b|crkey|appletv|viera|aquos/i;

const OVERRIDE_KEY = "sk-platform-override";

export interface PlatformInfo {
  platform: Platform;
  isNativeShell: boolean;
  isElectron: boolean;
  /** forced with ?platform=… — native probing must not override it */
  overridden?: boolean;
}

function readOverride(): Platform | null {
  try {
    const param = new URLSearchParams(window.location.search).get("platform");
    if (param === "auto") sessionStorage.removeItem(OVERRIDE_KEY);
    else if (param === "tv" || param === "mobile" || param === "desktop" || param === "web") {
      sessionStorage.setItem(OVERRIDE_KEY, param);
    }
    const v = sessionStorage.getItem(OVERRIDE_KEY);
    return v === "tv" || v === "mobile" || v === "desktop" || v === "web" ? v : null;
  } catch {
    return null;
  }
}

function isNativeShell(): boolean {
  try {
    // development only: `?shell=native` simulates the Android app's Back / exit behaviour in a browser
    if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("shell") === "native") {
      return true;
    }
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Best synchronous guess, used for the first paint:
 * - Android shell: TV when the device has no touch screen (TV boxes / sticks)
 * - Electron: desktop
 * - Smart-TV browsers (Tizen, webOS, …): tv
 * - Phones: mobile, everything else: web (responsive)
 * `?platform=tv|mobile|desktop|web` forces a mode for the session (QA / demos),
 * `?platform=auto` clears it.
 */
export function detectPlatform(): PlatformInfo {
  const ua = navigator.userAgent;
  const native = isNativeShell();
  const electron = /Electron\//.test(ua);
  const override = readOverride();
  if (override) return { platform: override, isNativeShell: native, isElectron: electron, overridden: true };

  const coarse = window.matchMedia?.("(any-pointer: coarse)").matches ?? false;
  if (native) return { platform: coarse ? "mobile" : "tv", isNativeShell: true, isElectron: false };
  if (electron) return { platform: "desktop", isNativeShell: false, isElectron: true };
  if (TV_UA.test(ua)) return { platform: "tv", isNativeShell: false, isElectron: false };
  const shortSide = Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0);
  if (coarse && shortSide > 0 && shortSide < 600) return { platform: "mobile", isNativeShell: false, isElectron: false };
  return { platform: "web", isNativeShell: false, isElectron: false };
}
