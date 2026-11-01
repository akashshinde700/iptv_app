"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";

/**
 * The ONE place that decides what "Back" means. Every source funnels here:
 * the Android shell's hardware/remote Back (window.__skBack), Escape / TV remote
 * back keys (AppShell), and the browser / Electron back button (history guard).
 *
 * Order:
 *   1. close the top overlay (dialog, sheet, dropdown, exit prompt)
 *   2. leave fullscreen
 *   3. screen-level handlers registered with useBackHandler (e.g. a filter panel)
 *   4. pop the navigation stack
 *   5. at the root: native apps ask "Exit?", the web lets the browser go back
 */

export type BackResult = "handled" | "unhandled";

type Handler = () => boolean;
const handlers: { current: Handler }[] = [];

let dispatchingEscape = false;

/** true while handleBack is replaying Escape into an overlay — keydown listeners should ignore it */
export function isSyntheticEscape(): boolean {
  return dispatchingEscape;
}

const OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(",");

export function hasOpenOverlay(): boolean {
  return typeof document !== "undefined" && document.querySelector(OVERLAY_SELECTOR) !== null;
}

function closeTopOverlay(): boolean {
  if (!hasOpenOverlay()) return false;
  // Radix layers close on Escape (listener on the document) — replay one.
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  dispatchingEscape = true;
  try {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  } finally {
    dispatchingEscape = false;
  }
  return true;
}

export function handleBack(): BackResult {
  if (closeTopOverlay()) return "handled";

  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return "handled";
  }

  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i].current()) return "handled";
  }

  const state = useAppStore.getState();
  if (state.goBack()) return "handled";

  if (state.isNativeShell) {
    state.setExitConfirmOpen(true);
    return "handled";
  }
  return "unhandled";
}

/** Let a screen intercept Back while `enabled` (return true when it consumed it). */
export function useBackHandler(handler: Handler, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const entry = { current: () => ref.current() };
    handlers.push(entry);
    return () => {
      const idx = handlers.indexOf(entry);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }, [enabled]);
}

declare global {
  interface Window {
    /** called by MainActivity's OnBackPressedCallback — "handled" keeps the app open */
    __skBack?: () => BackResult;
  }
}

/**
 * Wires the native bridge and, for browsers / Electron, a single "guard" history
 * entry: while there is somewhere to go back to, the browser's back button pops our
 * stack instead of leaving the site. Returns a cleanup function.
 */
export function installBackBridge(): () => void {
  window.__skBack = handleBack;

  const { isNativeShell } = useAppStore.getState();
  // The Android shell intercepts Back natively; history entries would only add noise.
  if (isNativeShell) {
    return () => {
      delete window.__skBack;
    };
  }

  let guarded = false;
  let ignoreNextPop = false;

  const sync = () => {
    const depth = useAppStore.getState().stack.length;
    if (depth > 1 && !guarded) {
      history.pushState({ skGuard: true }, "");
      guarded = true;
    } else if (depth <= 1 && guarded) {
      // reached the root through in-app buttons: drop the guard so the next
      // browser Back leaves the site as expected
      guarded = false;
      ignoreNextPop = true;
      history.back();
    }
  };

  const onPop = () => {
    if (ignoreNextPop) {
      ignoreNextPop = false;
      return;
    }
    guarded = false;
    handleBack();
    sync();
  };

  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (state.stack.length !== prev.stack.length) sync();
  });
  window.addEventListener("popstate", onPop);
  sync();

  return () => {
    unsubscribe();
    window.removeEventListener("popstate", onPop);
    delete window.__skBack;
  };
}
