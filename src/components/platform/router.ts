"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Tiny hash router for the platform console: `#/customers/<id>?tab=subscription`.
 * Every screen and filter has a URL — refresh, browser Back and shared links work.
 */

export const SECTIONS = ["dashboard", "organizations", "customers", "subscriptions", "plans", "sources", "channels", "payments", "audit"] as const;
export type Section = (typeof SECTIONS)[number];

export interface Route {
  section: Section;
  id?: string;
  query: Record<string, string>;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path = "", qs = ""] = raw.split("?");
  const [section, id] = path.split("/");
  return {
    section: (SECTIONS as readonly string[]).includes(section) ? (section as Section) : "dashboard",
    id: id ? decodeURIComponent(id) : undefined,
    query: Object.fromEntries(new URLSearchParams(qs)),
  };
}

function clean(query: Record<string, string | undefined> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "" && entry[1] !== "ALL")
  );
}

export function routeHash(route: Route): string {
  const qs = new URLSearchParams(route.query).toString();
  return `#/${route.section}${route.id ? `/${encodeURIComponent(route.id)}` : ""}${qs ? `?${qs}` : ""}`;
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const route = useMemo(() => parseHash(hash), [hash]);

  /** Open a screen (adds a history entry). */
  const go = useCallback((section: Section, opts: { id?: string; query?: Record<string, string | undefined> } = {}) => {
    window.location.hash = routeHash({ section, id: opts.id, query: clean(opts.query) });
    window.scrollTo({ top: 0 });
  }, []);

  /** Change filters on the current screen (no extra history entries). */
  const setQuery = useCallback((patch: Record<string, string | undefined>) => {
    const current = parseHash(window.location.hash);
    const next = routeHash({ ...current, query: clean({ ...current.query, ...patch }) });
    history.replaceState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

  return { route, go, setQuery };
}
