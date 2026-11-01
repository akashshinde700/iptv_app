"use client";

import { Film, Home, Search, Tv, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, type View } from "@/lib/store";

const ITEMS: { name: View["name"]; label: string; icon: typeof Home }[] = [
  { name: "home", label: "Home", icon: Home },
  { name: "browse", label: "Channels", icon: Tv },
  { name: "movies", label: "Movies", icon: Film },
  { name: "search", label: "Search", icon: Search },
  { name: "account", label: "Profile", icon: UserRound },
];

/** Phone bottom tab bar — one-hand reachable, 56px targets, respects the home-indicator safe area. */
export function BottomNav() {
  const navigate = useAppStore((s) => s.navigate);
  const favorites = useAppStore((s) => s.favorites.length);
  const active = useAppStore((s) => {
    for (let i = s.stack.length - 1; i >= 0; i--) {
      if (s.stack[i].view.name !== "watch") return s.stack[i].view.name;
    }
    return "home";
  });

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const isActive = active === item.name || (item.name === "account" && (active === "premium" || active === "settings"));
          const badge = item.name === "favorites" ? favorites : 0;
          return (
            <button
              key={item.name}
              onClick={() => navigate({ name: item.name } as View)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                isActive ? "text-primary" : "text-muted-foreground active:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span>{item.label}</span>
              {badge > 0 && (
                <span className="absolute right-[20%] top-1.5 rounded-full bg-primary px-1 text-[9px] font-bold leading-3.5 text-primary-foreground">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
              {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
