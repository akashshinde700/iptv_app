"use client";

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { toPlayableUrl } from "@/lib/api";
import { guessStreamMimeType } from "@/lib/native-utils";
import type { StreamInfo } from "@/lib/types";

/**
 * Bridges to the local Capacitor plugins in android/app/src/main/java/com/streamkaro/app.
 * The website is the same in browsers and in the APK shell — always feature-detect with
 * `hasNativePlugin` (old 0.3.x APKs don't have these plugins).
 */

export interface NativeAppInfo {
  versionName: string;
  versionCode: number;
  packageName: string;
  flavor: "tv" | "mobile";
  isTv: boolean;
  sdkInt: number;
  canInstall: boolean;
}

export interface NativePlayResult {
  /** next / previous = the viewer asked for another channel from the player */
  reason: "closed" | "ended" | "error" | "next" | "previous";
  message?: string;
  errorKind?: "network" | "decode" | "other";
}

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
}

interface NativePlayerPlugin {
  play(options: {
    url: string;
    title?: string;
    mimeType?: string;
    hasPrevious?: boolean;
    hasNext?: boolean;
  }): Promise<NativePlayResult>;
}

interface AppUpdaterPlugin {
  getInfo(): Promise<NativeAppInfo>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<{ started: boolean }>;
  addListener(
    eventName: "downloadProgress",
    listener: (progress: DownloadProgress) => void
  ): Promise<PluginListenerHandle>;
}

interface ShellPlugin {
  exitApp(): Promise<void>;
}

export const NativePlayer = registerPlugin<NativePlayerPlugin>("NativePlayer");
export const AppUpdater = registerPlugin<AppUpdaterPlugin>("AppUpdater");
export const Shell = registerPlugin<ShellPlugin>("Shell");

/** Closes the Android app (only after the user confirmed the exit prompt). */
export async function exitNativeApp(): Promise<void> {
  if (hasNativePlugin("Shell")) await Shell.exitApp();
}

export function hasNativePlugin(name: "NativePlayer" | "AppUpdater" | "Shell"): boolean {
  try {
    return typeof window !== "undefined" && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(name);
  } catch {
    return false;
  }
}

let appInfoPromise: Promise<NativeAppInfo | null> | null = null;

/** Installed app details (cached); null in browsers / old APKs. */
export function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  if (!hasNativePlugin("AppUpdater")) return Promise.resolve(null);
  appInfoPromise ??= AppUpdater.getInfo().catch(() => null);
  return appInfoPromise;
}

/** Opens the full-screen Media3 player; resolves when the user leaves it. */
export function playNative(
  stream: StreamInfo,
  options: { title?: string; hasPrevious?: boolean; hasNext?: boolean } = {}
): Promise<NativePlayResult> {
  const url = new URL(toPlayableUrl(stream.url), window.location.origin).href;
  return NativePlayer.play({
    url,
    title: options.title ?? stream.title ?? undefined,
    mimeType: guessStreamMimeType(stream.url),
    hasPrevious: options.hasPrevious ?? false,
    hasNext: options.hasNext ?? false,
  });
}

const ENGINE_KEY = "sk-player-engine";

/** "native" | "web" chosen by the user, or null for the device default. */
export function readPlayerEnginePreference(): "native" | "web" | null {
  try {
    const v = localStorage.getItem(ENGINE_KEY);
    return v === "native" || v === "web" ? v : null;
  } catch {
    return null;
  }
}

export function savePlayerEnginePreference(engine: "native" | "web"): void {
  try {
    localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    /* storage blocked */
  }
}
