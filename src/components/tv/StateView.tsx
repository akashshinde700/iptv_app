"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Lock, ServerCrash, WifiOff, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "warning" | "error";

const TONES: Record<Tone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  warning: "bg-amber-500/15 text-amber-400",
  error: "bg-destructive/15 text-destructive",
};

/** Shared empty / error / locked state: big icon, clear title, one-line reason, actions. */
export function StateView({
  icon: Icon,
  title,
  message,
  tone = "default",
  compact = false,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  message?: React.ReactNode;
  tone?: Tone;
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 text-center",
        compact ? "py-10" : "py-20",
        className
      )}
    >
      <span className={cn("flex h-16 w-16 items-center justify-center rounded-full", TONES[tone])}>
        <Icon className="h-8 w-8" aria-hidden />
      </span>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

export interface DescribedError {
  kind: "offline" | "server" | "denied" | "network" | "other";
  icon: LucideIcon;
  title: string;
  message: string;
}

/** Turns a failed request into something a viewer can act on. */
export function describeError(error: unknown, fallback = "Something went wrong while loading."): DescribedError {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { kind: "offline", icon: WifiOff, title: "No internet connection", message: "Check your Wi-Fi or network, then try again." };
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return { kind: "denied", icon: Lock, title: "Access required", message: error.message };
    }
    if (error.status >= 500) {
      return {
        kind: "server",
        icon: ServerCrash,
        title: "Server unavailable",
        message: "StreamKaro is having trouble right now. Please try again in a moment.",
      };
    }
    return { kind: "other", icon: ServerCrash, title: "Couldn't load", message: error.message || fallback };
  }
  if (error instanceof TypeError) {
    return { kind: "network", icon: WifiOff, title: "Network error", message: "We couldn't reach StreamKaro. Check your connection and try again." };
  }
  return { kind: "other", icon: ServerCrash, title: "Couldn't load", message: fallback };
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/** Thin banner under the header while the device is offline. */
export function OfflineBanner() {
  const online = useOnline();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Connection restored");
    }
  }, [online]);

  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-center text-sm font-medium text-amber-300"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      You&apos;re offline — channels will load again when the connection is back.
    </div>
  );
}
