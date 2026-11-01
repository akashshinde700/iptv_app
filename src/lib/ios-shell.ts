/**
 * StreamKaro iOS app bridge.
 *
 * The iOS app (`ios/`, built with xtool) is a native SwiftUI shell around this
 * website. It injects `window.StreamKaroNative` at document start, so the web
 * app can use real iOS affordances instead of browser workarounds.
 *
 * Everything here is optional — on the web, in the Android app and on TV these
 * helpers return `null` and callers fall back to normal behaviour.
 *
 * See docs/IOS_APP.md for the native side.
 */

export type IosHapticStyle = "light" | "medium" | "heavy" | "success" | "warning" | "error";

export interface StreamKaroIosShell {
  readonly version: number;
  readonly platform: "ios";
  post: (name: string, body?: Record<string, unknown>) => void;
  /** Native share sheet (UIActivityViewController). */
  share: (payload: { url?: string; title?: string }) => void;
  haptic: (style?: IosHapticStyle) => void;
  /** Stops the screen from dimming — the shell does this automatically while video plays. */
  keepAwake: (on: boolean) => void;
  /** Opens a link in Safari instead of the in-app web view. */
  openExternal: (url: string) => void;
  /** Opens the native “StreamKaro server” settings screen. */
  openSettings: () => void;
  onAppForeground: (() => void) | null;
}

declare global {
  interface Window {
    StreamKaroNative?: StreamKaroIosShell;
  }
}

/** The iOS shell object, or `null` in a browser / Android / TV. */
export function getIosShell(): StreamKaroIosShell | null {
  if (typeof window === "undefined") return null;
  const shell = window.StreamKaroNative;
  return shell && shell.platform === "ios" ? shell : null;
}

/** True while running inside the native iOS app. */
export function isIosShell(): boolean {
  return getIosShell() !== null;
}

/** Share via iOS when available; otherwise the Web Share API; otherwise copy. */
export async function shareLink(payload: { url: string; title?: string }): Promise<"native" | "web" | "copied" | "failed"> {
  const shell = getIosShell();
  if (shell) {
    shell.share(payload);
    shell.haptic("light");
    return "native";
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return "web";
    } catch {
      // The viewer dismissed the sheet — fall through to copying.
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(payload.url);
      return "copied";
    } catch {
      return "failed";
    }
  }
  return "failed";
}

/** A tap the phone can feel — no-op everywhere else. */
export function haptic(style: IosHapticStyle = "light"): void {
  getIosShell()?.haptic(style);
}
