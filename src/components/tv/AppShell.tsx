"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { useAppStore, useIsTv, type View } from "@/lib/store";
import { detectPlatform } from "@/lib/platform";
import { getNativeAppInfo } from "@/lib/native";
import { handleBack, hasOpenOverlay, installBackBridge, isSyntheticEscape } from "@/lib/back";
import {
  focusScreenStartWhenReady,
  installFocusRescue,
  installInputModeTracking,
  isKeyboardMode,
  restoreScreen,
} from "@/lib/focus";
import { useSpatialNav } from "@/lib/use-spatial-nav";
import { cn } from "@/lib/utils";
import { MobileHeader, SideNav, TvHeader } from "@/components/tv/Navigation";
import { BottomNav } from "@/components/tv/BottomNav";
import { Footer } from "@/components/tv/Footer";
import { HomeView } from "@/components/tv/HomeView";
import { BrowseView } from "@/components/tv/BrowseView";
import { SearchView } from "@/components/tv/SearchView";
import { FavoritesView, HistoryView } from "@/components/tv/FavoritesView";
import { PremiumView } from "@/components/tv/PremiumView";
import { WatchView } from "@/components/tv/WatchView";
import { MediaHubView } from "@/components/tv/MediaHubView";
import { MediaTitleView } from "@/components/tv/MediaTitleView";
import { AdminView } from "@/components/admin/AdminView";
import { AccountView } from "@/components/tv/AccountView";
import { SettingsView } from "@/components/tv/SettingsView";
import { DownloadView } from "@/components/tv/DownloadView";
import { TvGuideDialog } from "@/components/tv/TvGuideDialog";
import { SupportDialog } from "@/components/tv/SupportDialog";
import { UpdatePrompt } from "@/components/tv/UpdatePrompt";
import { ExitConfirmDialog } from "@/components/tv/ExitConfirmDialog";
import { RemoteHints } from "@/components/tv/RemoteHints";
import { OfflineBanner } from "@/components/tv/StateView";

/**
 * Captured `beforeinstallprompt` event, shared with the InstallButton.
 */
let deferredInstallPrompt: (Event & { prompt: () => void }) | null = null;
export function getInstallPrompt() {
  return deferredInstallPrompt;
}

/** Back on TV remotes: Escape (Android WebView / keyboards), GoBack, webOS 461, Tizen 10009. */
const BACK_KEYS = new Set(["Escape", "GoBack", "BrowserBack"]);
const BACK_KEY_CODES = new Set([461, 10009]);

function viewKey(view: View): string {
  if (view.name === "watch") return `watch-${view.channelId}`;
  if (view.name === "movie") return `movie-${view.movieId}`;
  if (view.name === "title") return `title-${view.id}`;
  return view.name;
}

/**
 * One shared app, four experiences:
 * - tv       (Android TV app, smart-TV browsers, TV Mode): top header, focus-first 10-foot UI, D-pad
 * - desktop  (Windows app) and web ≥ md: sidebar + content, keyboard + mouse
 * - mobile / web < md: compact header + bottom tabs, touch-first
 * Navigation, Back, focus and scroll restoration are centralised here.
 */
export function AppShell() {
  const view = useAppStore((s) => s.view);
  const platform = useAppStore((s) => s.platform);
  const isNativeShell = useAppStore((s) => s.isNativeShell);
  const isElectron = useAppStore((s) => s.isElectron);
  const isTv = useIsTv();
  const [ready, setReady] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // platform detection + persisted preferences (client only)
  useEffect(() => {
    installInputModeTracking();
    const info = detectPlatform();
    const { setPlatform } = useAppStore.getState();
    setPlatform({ platform: info.platform, isNativeShell: info.isNativeShell, isElectron: info.isElectron });
    Promise.resolve(useAppStore.persist.rehydrate()).finally(() => setReady(true));
    // the Android shell knows for sure whether it runs on a TV
    if (info.isNativeShell && !info.overridden) {
      getNativeAppInfo().then((native) => {
        if (native) setPlatform({ platform: native.isTv ? "tv" : "mobile", isNativeShell: true, isElectron: false });
      });
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    return installBackBridge();
  }, [ready, isNativeShell]);

  // register service worker for PWA installability + offline shell
  useEffect(() => {
    if ("serviceWorker" in navigator && !isNativeShell && !isElectron) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstallPrompt = e as Event & { prompt: () => void };
      window.dispatchEvent(new Event("streamkaro:installable"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [isNativeShell, isElectron]);

  // presentation classes: TV scales the whole UI via the root font-size
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("tv-mode", isTv);
    root.classList.toggle("native-shell", isNativeShell);
    root.dataset.platform = platform;
    return () => {
      root.classList.remove("tv-mode", "native-shell");
    };
  }, [isTv, isNativeShell, platform]);

  // D-pad / arrow-key navigation: TVs and the Windows app
  useSpatialNav(ready && (isTv || isElectron));

  useEffect(() => {
    if (!ready || !(isTv || isElectron)) return;
    return installFocusRescue();
  }, [ready, isTv, isElectron]);

  // Back keys (TV remotes, Escape) + "/" to search on keyboards
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSyntheticEscape()) return;
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      const findShortcut = (e.key === "f" || e.key === "F") && (e.ctrlKey || e.metaKey);
      if (((e.key === "/" && !typing) || findShortcut) && !isTv && !overlayAtKeyStart) {
        e.preventDefault();
        useAppStore.getState().navigate({ name: "search" });
        return;
      }

      const isBack = BACK_KEYS.has(e.key) || BACK_KEY_CODES.has(e.keyCode);
      if (!isBack) return;
      // Radix dialogs / sheets / menus close themselves on Escape — that Escape must not
      // also leave the screen underneath. Judged at the start of the key press: a layer
      // that is still animating closed must not swallow the next Back.
      if (e.key === "Escape" && overlayAtKeyStart) return;
      if (typing && e.key === "Escape") {
        target.blur();
        e.preventDefault();
        return;
      }
      if (handleBack() === "handled") e.preventDefault();
    };
    let overlayAtKeyStart = false;
    const onKeyCapture = () => {
      overlayAtKeyStart = hasOpenOverlay();
    };
    window.addEventListener("keydown", onKeyCapture, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKeyCapture, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [isTv]);

  // new screen: top + logical focus; Back: previous scroll offset + the item the user left from
  useLayoutEffect(() => {
    if (!ready) return;
    const target = useAppStore.getState().consumeRestore();
    const wantsFocus = isTv || isElectron || isKeyboardMode();
    if (target) return restoreScreen(target, { focus: wantsFocus });
    window.scrollTo({ top: 0 });
    if (wantsFocus) return focusScreenStartWhenReady();
  }, [view, ready]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <img src="/icons/icon-192.png" alt="StreamKaro" className="h-16 w-16 rounded-2xl" />
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  const showFooter = platform === "web" && !isTv;

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        {isTv ? (
          <TvHeader />
        ) : (
          <>
            <SideNav />
            <MobileHeader />
          </>
        )}

        <div className={cn("flex min-h-screen flex-col", !isTv && "md:pl-20 lg:pl-64")}>
          <OfflineBanner />
          <main
            className={cn(
              "mx-auto w-full flex-1",
              isTv ? "max-w-[1800px] px-8 pb-12 pt-6" : "max-w-[1600px] px-3 pb-28 pt-4 sm:px-6 md:pb-12 lg:px-8"
            )}
          >
            <div key={viewKey(view)} data-view={view.name} className="animate-in fade-in duration-200">
              {view.name === "home" && <HomeView />}
              {view.name === "browse" && <BrowseView />}
              {view.name === "movies" && <MediaHubView />}
              {view.name === "title" && <MediaTitleView key={view.id} id={view.id} />}
              {view.name === "movie" && <MediaTitleView key={view.movieId} id={`catalog:movie:${view.movieId}`} />}
              {view.name === "search" && <SearchView />}
              {view.name === "favorites" && <FavoritesView />}
              {view.name === "history" && <HistoryView />}
              {view.name === "premium" && <PremiumView />}
              {view.name === "account" && <AccountView />}
              {view.name === "settings" && <SettingsView />}
              {view.name === "admin" && <AdminView />}
              {view.name === "download" && <DownloadView />}
              {view.name === "watch" && <WatchView key={view.channelId} channelId={view.channelId} />}
            </div>
          </main>
          {showFooter && <Footer />}
        </div>

        {!isTv && <BottomNav />}
        <TvGuideDialog />
        <SupportDialog />
        <UpdatePrompt />
        <ExitConfirmDialog />
        <RemoteHints />
      </div>
      <Toaster
        theme="dark"
        position={isTv ? "bottom-center" : "top-center"}
        richColors
        closeButton={!isTv}
        toastOptions={isTv ? { className: "!text-lg" } : undefined}
      />
    </QueryClientProvider>
  );
}
