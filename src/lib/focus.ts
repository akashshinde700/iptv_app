"use client";

import type { RestoreTarget } from "@/lib/store";

/**
 * Focus + scroll restoration helpers.
 *
 * Focusable items that should be found again after Back carry `data-focus-key`
 * (e.g. `ch-<channelId>`, `cat-news`). A screen marks its most logical first
 * element with `data-autofocus`.
 */

let keyboardMode = false;
let installed = false;

/** Tracks whether the user is driving the UI with keys/remote (vs touch/mouse). */
export function installInputModeTracking() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", () => (keyboardMode = true), { capture: true, passive: true });
  window.addEventListener("pointerdown", () => (keyboardMode = false), { capture: true, passive: true });
}

export function isKeyboardMode(): boolean {
  return keyboardMode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function inViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
}

/** Move focus to the screen's preferred element (or its first focusable one). */
export function focusScreenStart(root: ParentNode = document, allowFallback = true): boolean {
  const main = (root as Document).querySelector?.("main") ?? root;
  const preferred = Array.from(main.querySelectorAll<HTMLElement>("[data-autofocus]")).find(isVisible);
  const fallback = allowFallback
    ? Array.from(main.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => isVisible(el) && inViewport(el))
    : undefined;
  const target = preferred ?? fallback;
  if (!target) return false;
  target.focus({ preventScroll: true });
  if (!inViewport(target)) target.scrollIntoView({ block: "center" });
  return true;
}

/**
 * Keep trying focusScreenStart while the new screen's content is still loading (slow
 * TV networks). Stops as soon as the user moves focus themselves.
 */
export function focusScreenStartWhenReady(timeoutMs = 8000): () => void {
  let cancelled = false;
  const start = performance.now();
  const deadline = start + timeoutMs;
  const initial = document.activeElement;
  const tick = () => {
    if (cancelled) return;
    const current = document.activeElement;
    if (current && current !== initial && current !== document.body) return;
    // give the screen's preferred element (often data that is still loading) a head start
    if (focusScreenStart(document, performance.now() - start > 3000)) return;
    if (performance.now() < deadline) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    cancelled = true;
  };
}

/**
 * Remote users must never lose focus. When the focused item disappears (a filter swaps
 * the results, a row reloads) focus moves to the same region's preferred / first item
 * instead of falling back to <body>.
 */
export function installFocusRescue(): () => void {
  let lastFocused: HTMLElement | null = null;
  let lastGroup: string | null = null;

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target || target === document.body) return;
    lastFocused = target;
    lastGroup = target.closest<HTMLElement>("[data-nav-group]")?.dataset.navGroup ?? null;
  };

  const observer = new MutationObserver(() => {
    if (!lastFocused || lastFocused.isConnected) return;
    const group = lastGroup;
    lastFocused = null;
    if (!group) return;
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      // only within the same region on the same screen — screen changes restore focus themselves
      const region = document.querySelector<HTMLElement>(`[data-nav-group="${CSS.escape(group)}"]`);
      const target =
        region?.querySelector<HTMLElement>("[data-autofocus]") ??
        Array.from(region?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).find(isVisible);
      target?.focus({ preventScroll: true });
    });
  });

  document.addEventListener("focusin", onFocusIn);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    document.removeEventListener("focusin", onFocusIn);
    observer.disconnect();
  };
}

/**
 * After Back: wait for the previous screen's content (data may still be coming from
 * cache), restore the scroll offset, then re-focus the item the user left from.
 */
export function restoreScreen(target: RestoreTarget, { focus }: { focus: boolean }): () => void {
  let cancelled = false;
  const deadline = performance.now() + 2500;

  const tick = () => {
    if (cancelled) return;
    const el = target.focusKey
      ? document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(target.focusKey)}"]`)
      : null;
    const tallEnough = document.documentElement.scrollHeight >= target.scrollY + window.innerHeight * 0.5;
    const ready = target.focusKey ? !!el : tallEnough;

    if (!ready && performance.now() < deadline) {
      requestAnimationFrame(tick);
      return;
    }

    window.scrollTo({ top: target.scrollY, behavior: "auto" });
    if (focus) {
      if (el) {
        el.focus({ preventScroll: true });
        if (!inViewport(el)) el.scrollIntoView({ block: "center" });
      } else {
        focusScreenStartWhenReady();
      }
    }
  };

  requestAnimationFrame(tick);
  return () => {
    cancelled = true;
  };
}
