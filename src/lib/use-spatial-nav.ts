"use client";

import { useEffect } from "react";

const DIRECTIONS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const FOCUSABLE =
  'a[href], button:not([disabled]), [role="button"], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const MODAL_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

function isScrollable(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  const scrollY = /(auto|scroll)/.test(`${s.overflowY} ${s.overflow} ${s.overflowX}`);
  return scrollY && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
}

function isCandidate(el: HTMLElement): boolean {
  if (el === document.body) return false;
  if (el.getAttribute("tabindex") === "-1" || el.closest("[data-nav-skip]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const withVisibility = el as HTMLElement & { checkVisibility?: (o?: object) => boolean };
  if (withVisibility.checkVisibility) {
    return withVisibility.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true });
  }
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none" && s.pointerEvents !== "none";
}

/** The element a group should hand focus to when entered from outside. */
function groupEntry(group: HTMLElement, candidates: HTMLElement[]): HTMLElement | null {
  const lastKey = group.dataset.navLast;
  const inGroup = candidates.filter((el) => group.contains(el));
  if (lastKey) {
    const last = inGroup.find((el) => el.closest<HTMLElement>("[data-focus-key]")?.dataset.focusKey === lastKey);
    if (last) return last;
  }
  return inGroup.find((el) => el.matches('[aria-current="true"], [aria-current="page"], [data-selected="true"]')) ?? null;
}

/**
 * D-pad navigation for TV remotes / keyboards: arrow keys move focus to the nearest
 * focusable element in the pressed direction.
 * - Stays inside an open modal (focus never escapes behind a dialog).
 * - Leaves keys alone that a widget already handled (Radix Select / menus / sliders).
 * - `data-nav-group` regions remember their last focused item: moving back into a
 *   group (e.g. from the channel grid to the category rail) lands on that item or
 *   on the selected one instead of the geometrically nearest one.
 * - When nothing lies in that direction the nearest scrollable ancestor scrolls.
 */
export function useSpatialNav(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const group = target?.closest<HTMLElement>("[data-nav-group]");
      const key = target?.closest<HTMLElement>("[data-focus-key]")?.dataset.focusKey;
      if (group && key) group.dataset.navLast = key;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      if (!DIRECTIONS.has(key) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;

      const active = document.activeElement as HTMLElement | null;
      // inside a text field: Left/Right move the caret; Up/Down (or Left/Right at
      // the edges of an empty field) leave it so the remote never gets stuck
      if (active && (active.tagName === "INPUT" || active.isContentEditable)) {
        const input = active as HTMLInputElement;
        const empty = input.value.length === 0;
        const escapeVertical = key === "ArrowUp" || key === "ArrowDown";
        const escapeSide = (key === "ArrowLeft" || key === "ArrowRight") && empty;
        if (!escapeVertical && !escapeSide) return;
      } else if (active && active.tagName === "TEXTAREA") {
        return;
      } else if (active?.closest('[role="slider"]') && (key === "ArrowLeft" || key === "ArrowRight")) {
        return;
      }

      const modals = document.querySelectorAll<HTMLElement>(MODAL_SELECTOR);
      const scope: ParentNode = modals.length > 0 ? modals[modals.length - 1] : document;
      const candidates = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isCandidate);
      if (candidates.length === 0) return;

      e.preventDefault();
      const behavior: ScrollBehavior = e.repeat ? "auto" : "smooth";

      const from = active && candidates.includes(active) ? active : null;
      if (!from) {
        const start =
          candidates.find((el) => el.hasAttribute("data-autofocus")) ??
          candidates.find((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight;
          }) ??
          candidates[0];
        start.focus({ preventScroll: true });
        start.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
        return;
      }

      const fr = from.getBoundingClientRect();
      const fx = fr.left + fr.width / 2;
      const fy = fr.top + fr.height / 2;

      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      const horizontal = key === "ArrowLeft" || key === "ArrowRight";
      for (const el of candidates) {
        if (el === from || el.contains(from) || from.contains(el)) continue;
        const r = el.getBoundingClientRect();
        // Only elements that really lie beyond the current one's edge count — otherwise
        // the right end of a grid row would "move right" into the header above it.
        let primary: number;
        if (key === "ArrowRight") {
          if (!(r.left >= fr.right - 4 || r.left + r.width / 2 > fr.right)) continue;
          primary = Math.max(0, r.left - fr.right);
        } else if (key === "ArrowLeft") {
          if (!(r.right <= fr.left + 4 || r.left + r.width / 2 < fr.left)) continue;
          primary = Math.max(0, fr.left - r.right);
        } else if (key === "ArrowDown") {
          if (!(r.top >= fr.bottom - 4 || r.top + r.height / 2 > fr.bottom)) continue;
          primary = Math.max(0, r.top - fr.bottom);
        } else {
          if (!(r.bottom <= fr.top + 4 || r.top + r.height / 2 < fr.top)) continue;
          primary = Math.max(0, fr.top - r.bottom);
        }
        // Cross axis: elements whose edges overlap the current one (same column / row)
        // are "in line" no matter their size — a small "Show password" button right
        // under a full-width field beats the Log in button further down.
        const crossGap = horizontal
          ? Math.max(0, r.top - fr.bottom, fr.top - r.bottom)
          : Math.max(0, r.left - fr.right, fr.left - r.right);
        const crossCenter = horizontal ? Math.abs(r.top + r.height / 2 - fy) : Math.abs(r.left + r.width / 2 - fx);
        const score = primary + crossGap * 3 + crossCenter * 0.15;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }

      if (best) {
        const fromGroup = from.closest<HTMLElement>("[data-nav-group]");
        const toGroup = best.closest<HTMLElement>("[data-nav-group]");
        if (toGroup && toGroup !== fromGroup) best = groupEntry(toGroup, candidates) ?? best;
        best.focus({ preventScroll: true });
        best.scrollIntoView({ block: "nearest", inline: "nearest", behavior });
        return;
      }

      // nothing in that direction: scroll the closest scrollable ancestor
      let node: HTMLElement | null = from.parentElement;
      while (node && node !== document.body) {
        if (isScrollable(node)) {
          const amount = 0.8;
          if (key === "ArrowDown") node.scrollBy({ top: node.clientHeight * amount, behavior });
          else if (key === "ArrowUp") node.scrollBy({ top: -node.clientHeight * amount, behavior });
          else if (key === "ArrowRight") node.scrollBy({ left: node.clientWidth * amount, behavior });
          else node.scrollBy({ left: -node.clientWidth * amount, behavior });
          return;
        }
        node = node.parentElement;
      }
    };

    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);
}
