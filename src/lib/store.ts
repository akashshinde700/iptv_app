"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type View =
  | { name: "home" }
  | { name: "browse" }
  | { name: "search" }
  | { name: "favorites" }
  | { name: "history" }
  | { name: "premium" }
  | { name: "account" }
  | { name: "settings" }
  | { name: "admin" }
  | { name: "download" }
  | { name: "movies" }
  | { name: "movie"; movieId: string }
  | { name: "title"; id: string }
  | { name: "watch"; channelId: string };

/**
 * Top-level destinations (nav bar / sidebar / bottom tabs). Opening one resets the
 * stack to Home → destination, so Back always climbs the hierarchy:
 *   Home ├ Channels ├ Search ├ Favorites ├ History ├ Subscription ├ Profile ├ Settings
 * and everything opened from them (the player) is pushed on top.
 */
const TOP_LEVEL = new Set<View["name"]>([
  "home",
  "browse",
  "search",
  "favorites",
  "history",
  "premium",
  "account",
  "settings",
  "admin",
  "download",
]);

export type Platform = "tv" | "mobile" | "desktop" | "web";

/** One screen in the back stack, with where the user was on it when they left. */
export interface NavEntry {
  view: View;
  scrollY: number;
  focusKey: string | null;
}

export interface RestoreTarget {
  scrollY: number;
  focusKey: string | null;
}

export type BrowseCollection = "all" | "favorites" | "recents";

export interface RecentMovie {
  id: string;
  title: string;
  poster: string | null;
  year: string | null;
  rating: string | null;
}

/** Resume position for a VOD title (`catalog:series:…:S1E2` style keys for episodes). */
export interface PlaybackProgress {
  seconds: number;
  duration: number;
  updatedAt: number;
}

export interface BrowseFilters {
  search: string;
  country: string;
  category: string;
  language: string;
  sort: "name" | "nameDesc";
  page: number;
  nsfw: boolean;
  collection: BrowseCollection;
}

const DEFAULT_FILTERS: BrowseFilters = {
  search: "",
  country: "",
  category: "",
  language: "",
  sort: "name",
  page: 1,
  nsfw: false,
  collection: "all",
};

const HOME: View = { name: "home" };

interface AppState {
  /** current view (mirror of the top of `stack`); never persisted — the app boots on home */
  view: View;
  stack: NavEntry[];
  /** set by goBack, consumed by AppShell once the previous screen has rendered */
  restore: RestoreTarget | null;
  browseFilters: BrowseFilters;
  searchQuery: string;
  /** channel ids of the list a channel was opened from — drives previous / next channel */
  watchContext: string[];
  favorites: string[];
  recents: string[];
  recentMovies: RecentMovie[];
  /** media-hub resume positions, keyed by the media id the player was opened with */
  progress: Record<string, PlaybackProgress>;
  premium: boolean;
  /** TV Mode: big UI + remote/D-pad arrow-key navigation (user toggle on web) */
  tvMode: boolean;
  platform: Platform;
  isNativeShell: boolean;
  isElectron: boolean;
  tvGuideOpen: boolean;
  supportOpen: boolean;
  exitConfirmOpen: boolean;

  /** open a screen (top-level destinations reset the stack to Home → destination) */
  navigate: (view: View) => void;
  /** swap the current screen without growing the stack (e.g. next channel) */
  replace: (view: View) => void;
  /** pop one screen; false when already at the root */
  goBack: () => boolean;
  consumeRestore: () => RestoreTarget | null;
  setFilters: (patch: Partial<BrowseFilters>) => void;
  resetFilters: () => void;
  setSearchQuery: (value: string) => void;
  setWatchContext: (ids: string[]) => void;
  toggleFavorite: (channelId: string) => void;
  addRecent: (channelId: string) => void;
  addRecentMovie: (movie: RecentMovie) => void;
  clearRecents: () => void;
  /** remember where the viewer stopped (throttled by the player, not per second) */
  saveProgress: (id: string, seconds: number, duration: number) => void;
  clearProgress: (id: string) => void;
  setPremium: (value: boolean) => void;
  setTvMode: (value: boolean) => void;
  setPlatform: (info: { platform: Platform; isNativeShell: boolean; isElectron: boolean }) => void;
  setTvGuideOpen: (value: boolean) => void;
  setSupportOpen: (value: boolean) => void;
  setExitConfirmOpen: (value: boolean) => void;
}

/** Where the user currently is on the page — saved before leaving a screen. */
function snapshot(): RestoreTarget {
  if (typeof document === "undefined") return { scrollY: 0, focusKey: null };
  const active = document.activeElement as HTMLElement | null;
  const keyed = active?.closest<HTMLElement>("[data-focus-key]");
  return { scrollY: window.scrollY, focusKey: keyed?.dataset.focusKey ?? null };
}

function sameView(a: View, b: View): boolean {
  if (a.name !== b.name) return false;
  // views that carry an id are only "the same" when the id matches — otherwise opening a
  // second title/channel from the first would be swallowed as a no-op navigation
  if (a.name === "watch") return b.name === "watch" && a.channelId === b.channelId;
  if (a.name === "title") return b.name === "title" && a.id === b.id;
  if (a.name === "movie") return b.name === "movie" && a.movieId === b.movieId;
  return true;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: HOME,
      stack: [{ view: HOME, scrollY: 0, focusKey: null }],
      restore: null,
      browseFilters: DEFAULT_FILTERS,
      searchQuery: "",
      watchContext: [],
      favorites: [],
      recents: [],
      recentMovies: [],
      progress: {},
      premium: false,
      tvMode: false,
      platform: "web",
      isNativeShell: false,
      isElectron: false,
      tvGuideOpen: false,
      supportOpen: false,
      exitConfirmOpen: false,

      navigate: (view) =>
        set((state) => {
          const current = state.stack[state.stack.length - 1];
          if (sameView(current.view, view)) return {};
          const saved = [...state.stack];
          saved[saved.length - 1] = { ...current, ...snapshot() };

          let stack: NavEntry[];
          if (view.name === "home") {
            // opening Home (nav, after login) starts at the top; only Back restores a position
            stack = [{ view: HOME, scrollY: 0, focusKey: null }];
            return { stack, view: HOME, restore: null };
          }
          if (TOP_LEVEL.has(view.name)) {
            const home = saved[0].view.name === "home" ? saved[0] : { view: HOME, scrollY: 0, focusKey: null };
            stack = [home, { view, scrollY: 0, focusKey: null }];
          } else {
            stack = [...saved, { view, scrollY: 0, focusKey: null }];
          }
          return { stack, view, restore: null };
        }),

      replace: (view) =>
        set((state) => {
          const stack = [...state.stack];
          stack[stack.length - 1] = { view, scrollY: 0, focusKey: null };
          return { stack, view, restore: null };
        }),

      goBack: () => {
        const { stack } = get();
        if (stack.length <= 1) return false;
        const next = stack.slice(0, -1);
        const top = next[next.length - 1];
        set({ stack: next, view: top.view, restore: { scrollY: top.scrollY, focusKey: top.focusKey } });
        return true;
      },

      consumeRestore: () => {
        const target = get().restore;
        if (target) set({ restore: null });
        return target;
      },

      setFilters: (patch) =>
        set((state) => {
          const next = { ...state.browseFilters, ...patch };
          // any filter change (except explicit pagination) resets to page 1
          if (patch.page === undefined) next.page = 1;
          return { browseFilters: next };
        }),

      resetFilters: () =>
        set((state) => ({ browseFilters: { ...DEFAULT_FILTERS, nsfw: state.browseFilters.nsfw } })),

      setSearchQuery: (value) => set({ searchQuery: value }),

      setWatchContext: (ids) => set({ watchContext: ids.slice(0, 500) }),

      toggleFavorite: (channelId) =>
        set((state) => ({
          favorites: state.favorites.includes(channelId)
            ? state.favorites.filter((id) => id !== channelId)
            : [channelId, ...state.favorites].slice(0, 200),
        })),

      addRecent: (channelId) =>
        set((state) => ({
          recents: [channelId, ...state.recents.filter((id) => id !== channelId)].slice(0, 24),
        })),

      addRecentMovie: (movie) =>
        set((state) => ({
          recentMovies: [movie, ...state.recentMovies.filter((item) => item.id !== movie.id)].slice(0, 24),
        })),

      clearRecents: () => set({ recents: [] }),

      saveProgress: (id, seconds, duration) =>
        set((state) => {
          if (!Number.isFinite(seconds) || seconds < 5) return {};
          // finished (or nearly) → forget it instead of offering a resume point at the credits
          if (Number.isFinite(duration) && duration > 0 && seconds > duration - 30) {
            const { [id]: _dropped, ...rest } = state.progress;
            return { progress: rest };
          }
          const next = { ...state.progress, [id]: { seconds, duration, updatedAt: Date.now() } };
          // keep the store small — 60 titles is plenty of history
          const entries = Object.entries(next)
            .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
            .slice(0, 60);
          return { progress: Object.fromEntries(entries) };
        }),

      clearProgress: (id) =>
        set((state) => {
          const { [id]: _dropped, ...rest } = state.progress;
          return { progress: rest };
        }),

      setPremium: (value) => set({ premium: value }),
      setTvMode: (value) => set({ tvMode: value }),
      setPlatform: (info) => set(info),
      setTvGuideOpen: (value) => set({ tvGuideOpen: value }),
      setSupportOpen: (value) => set({ supportOpen: value }),
      setExitConfirmOpen: (value) => set({ exitConfirmOpen: value }),
    }),
    {
      name: "streamkaro-app",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        browseFilters: state.browseFilters,
        favorites: state.favorites,
        recents: state.recents,
        recentMovies: state.recentMovies,
        progress: state.progress,
        premium: state.premium,
        tvMode: state.tvMode,
      }),
      // older saved filters predate `collection`
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...saved,
          browseFilters: { ...DEFAULT_FILTERS, ...(saved.browseFilters ?? {}) },
        };
      },
    }
  )
);

/** Presentation mode: the TV (10-foot, remote-first) layout. */
export function useIsTv(): boolean {
  return useAppStore((s) => s.platform === "tv" || s.tvMode);
}
