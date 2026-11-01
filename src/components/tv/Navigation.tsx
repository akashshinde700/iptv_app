"use client";

import {
  Crown,
  Heart,
  History,
  Film,
  Home,
  LogIn,
  Search,
  Settings,
  Tv,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, type View } from "@/lib/store";
import { useMe } from "@/lib/use-me";

type NavName = "home" | "browse" | "movies" | "search" | "favorites" | "history" | "premium" | "account" | "settings";

interface NavItem {
  name: NavName;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_NAV: NavItem[] = [
  { name: "home", label: "Home", icon: Home },
  { name: "browse", label: "Live TV", icon: Tv },
  { name: "movies", label: "Movies & TV", icon: Film },
  { name: "search", label: "Search", icon: Search },
  { name: "favorites", label: "Favorites", icon: Heart },
  { name: "history", label: "History", icon: History },
];

const ACCOUNT_NAV: NavItem[] = [
  { name: "premium", label: "Subscription", icon: Crown },
  { name: "account", label: "Profile", icon: UserRound },
  { name: "settings", label: "Settings", icon: Settings },
];

/** The top-level section to highlight — the player highlights the list it was opened from. */
function useActiveSection(): View["name"] {
  return useAppStore((s) => {
    for (let i = s.stack.length - 1; i >= 0; i--) {
      if (s.stack[i].view.name !== "watch") return s.stack[i].view.name;
    }
    return "home";
  });
}

function go(name: NavName) {
  useAppStore.getState().navigate({ name } as View);
}

/* ---------------------------------- TV ---------------------------------- */

/** History lives in Home's "Continue watching" and the channel rail on TV — fewer header stops. */
const TV_NAV = PRIMARY_NAV.filter((item) => item.name !== "history");

/**
 * 10-foot header: [Logo]  Home · Live TV · Search · Favorites        Plan · Profile · Settings
 * Sized in rem so it fits every TV CSS width (the root font scales with the screen);
 * on the narrowest TV viewports the account items collapse to icons.
 */
export function TvHeader() {
  const active = useActiveSection();
  const me = useMe();
  const customer = me.data?.customer ?? null;
  const hasAccess = me.data?.access.hasAccess ?? false;

  return (
    <header className="w-full border-b border-border/50 bg-background/95" data-nav-group="header">
      <div className="mx-auto flex min-w-0 max-w-[1800px] items-center gap-2 px-8 py-3">
        <button
          onClick={() => go("home")}
          data-focus-key="nav-logo"
          className="tv-nav-item flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl outline-none focus-visible:bg-primary/20"
          aria-label="StreamKaro home"
        >
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
        </button>

        <nav className="ml-4 flex min-w-0 items-center gap-1.5" aria-label="Primary">
          {TV_NAV.map((item) => (
            <TvNavButton key={item.name} item={item} active={active === item.name} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <TvNavButton
            item={{ ...ACCOUNT_NAV[0], label: hasAccess ? customer?.plan?.name ?? "My plan" : "Plans" }}
            active={active === "premium"}
            compactBelow
          />
          <TvNavButton
            item={{
              ...ACCOUNT_NAV[1],
              label: customer ? customer.name.split(" ")[0] || customer.username : "Log in",
              icon: customer ? UserRound : LogIn,
            }}
            active={active === "account"}
            compactBelow
          />
          <TvNavButton item={ACCOUNT_NAV[2]} active={active === "settings"} iconOnly />
        </div>
      </div>
    </header>
  );
}

function TvNavButton({
  item,
  active,
  iconOnly = false,
  compactBelow = false,
}: {
  item: NavItem;
  active: boolean;
  iconOnly?: boolean;
  /** icon-only on narrow TV viewports (label kept for screen readers) */
  compactBelow?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => go(item.name)}
      data-focus-key={`nav-${item.name}`}
      aria-current={active ? "page" : undefined}
      aria-label={iconOnly ? item.label : undefined}
      title={item.label}
      className={cn(
        "tv-nav-item flex h-12 shrink-0 items-center gap-2 rounded-full text-base font-semibold outline-none transition-colors",
        iconOnly ? "w-12 justify-center" : "px-4",
        compactBelow && "max-[1099px]:w-12 max-[1099px]:justify-center max-[1099px]:px-0",
        active ? "bg-primary/15 text-primary" : "text-foreground/75",
        "focus-visible:bg-primary focus-visible:text-primary-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {!iconOnly && (
        <span className={cn("max-w-[9rem] truncate", compactBelow && "max-[1099px]:sr-only")}>{item.label}</span>
      )}
    </button>
  );
}

/* ------------------------------ Desktop / tablet ------------------------------ */

/** Windows app + web ≥ md: icon rail on tablets, full sidebar from lg. */
export function SideNav() {
  const active = useActiveSection();
  const favorites = useAppStore((s) => s.favorites.length);
  const me = useMe();
  const customer = me.data?.customer ?? null;
  const hasAccess = me.data?.access.hasAccess ?? false;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col border-r border-border/60 bg-card/50 backdrop-blur-md md:flex lg:w-64"
      aria-label="Sidebar"
    >
      <button
        onClick={() => go("home")}
        className="flex h-16 shrink-0 items-center justify-center gap-2.5 px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring lg:justify-start lg:px-5"
        aria-label="StreamKaro home"
      >
        <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-lg" />
        <span className="hidden text-lg font-bold tracking-tight text-brand-gradient lg:inline">StreamKaro</span>
      </button>

      <nav className="thin-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Primary">
        {PRIMARY_NAV.map((item) => (
          <SideNavLink
            key={item.name}
            item={item}
            active={active === item.name}
            badge={item.name === "favorites" && favorites > 0 ? favorites : undefined}
          />
        ))}
        <div className="!my-3 border-t border-border/50" />
        {ACCOUNT_NAV.map((item) => (
          <SideNavLink key={item.name} item={item} active={active === item.name} />
        ))}
      </nav>

      <div className="hidden border-t border-border/50 p-3 lg:block">
        {me.isLoading ? (
          <div className="h-11 animate-pulse rounded-lg bg-muted/50" />
        ) : customer ? (
          <button
            onClick={() => go("account")}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {(customer.name || customer.username).charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{customer.name || customer.username}</span>
              <span className={cn("block truncate text-xs", hasAccess ? "text-emerald-400" : "text-amber-400")}>
                {hasAccess ? customer.plan?.name ?? "Active plan" : "No active plan"}
              </span>
            </span>
          </button>
        ) : (
          <button
            onClick={() => go("account")}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogIn className="h-4 w-4" /> Log in
          </button>
        )}
      </div>
    </aside>
  );
}

function SideNavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => go(item.name)}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 w-full items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors lg:justify-start",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden />}
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className="hidden lg:inline">{item.label}</span>
      {badge !== undefined && (
        <span className="absolute right-2 top-1.5 rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground lg:static lg:ml-auto">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/* --------------------------------- Mobile --------------------------------- */

/** Compact phone header (the bottom tab bar carries navigation). */
export function MobileHeader() {
  const me = useMe();
  const hasAccess = me.data?.access.hasAccess ?? false;
  const view = useAppStore((s) => s.view);

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 items-center gap-2 px-3">
        <button
          onClick={() => go("home")}
          className="flex items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="StreamKaro home"
        >
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-bold tracking-tight text-brand-gradient">StreamKaro</span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          {view.name !== "search" && (
            <button
              onClick={() => go("search")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/80 outline-none active:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Search channels"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => go(hasAccess ? "premium" : "account")}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              hasAccess ? "bg-amber-500/15 text-amber-300" : "bg-primary text-primary-foreground"
            )}
          >
            {hasAccess ? <Crown className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {hasAccess ? "My plan" : "Log in"}
          </button>
        </div>
      </div>
    </header>
  );
}
