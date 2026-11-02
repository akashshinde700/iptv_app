import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Is the viewport narrower than the mobile breakpoint?
 *
 * Implemented with `useSyncExternalStore` instead of `useState` + `useEffect`:
 *
 *  - no `setState` inside an effect, so no cascading render on mount (the old version
 *    rendered the desktop layout and then re-rendered into the mobile one on every load),
 *  - `matchMedia` is the source of truth and React subscribes to it directly, so a resize or a
 *    device rotation updates every consumer in one pass,
 *  - the server snapshot is `false`, which matches what the markup renders before hydration.
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
