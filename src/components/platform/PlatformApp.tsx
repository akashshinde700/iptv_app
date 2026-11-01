"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Building2,
  CalendarClock,
  Crown,
  IndianRupee,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  Rss,
  ScrollText,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { api, ApiFailure, type PlatformStats } from "./api";
import { useRoute, type Section } from "./router";
import { ErrorBox, inputCls } from "./ui";
import { DashboardSection } from "./Dashboard";
import { OrganizationsSection } from "./Organizations";
import { CustomersSection } from "./Customers";
import { CustomerDetailView } from "./CustomerDetail";
import { SubscriptionsSection } from "./Subscriptions";
import { PlansSection } from "./Plans";
import { ContentSourcesSection } from "./ContentSources";
import { ChannelHealthSection } from "./ChannelHealth";
import { PaymentsSection } from "./Payments";
import { AuditSection } from "./Audit";

const NAV: { section: Section; label: string; icon: LucideIcon }[] = [
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "organizations", label: "Organizations", icon: Building2 },
  { section: "customers", label: "Customers", icon: Users },
  { section: "subscriptions", label: "Subscriptions", icon: CalendarClock },
  { section: "plans", label: "Plans", icon: Crown },
  { section: "sources", label: "Content Sources", icon: Rss },
  { section: "channels", label: "Channel Health", icon: Activity },
  { section: "payments", label: "Payments", icon: IndianRupee },
  { section: "audit", label: "Audit log", icon: ScrollText },
];

export function PlatformApp() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 15_000,
            retry: (count, error) => !(error instanceof ApiFailure && error.status > 0 && error.status < 500) && count < 1,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <Console />
      <Toaster theme="dark" richColors position="top-right" closeButton />
    </QueryClientProvider>
  );
}

function Console() {
  const queryClient = useQueryClient();
  const { route, go } = useRoute();
  const stats = useQuery({
    queryKey: ["platform", "stats"],
    queryFn: () => api<PlatformStats>("/api/platform/stats"),
  });

  if (stats.isLoading) {
    return (
      <Center>
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" aria-label="Loading" />
      </Center>
    );
  }
  if (stats.error instanceof ApiFailure && (stats.error.status === 401 || stats.error.status === 403)) {
    return <PlatformLogin forbidden={stats.error.status === 403} onDone={() => queryClient.invalidateQueries()} />;
  }

  const badges: Partial<Record<Section, number>> = {
    subscriptions: stats.data?.subscribers.expiring7 ?? 0,
    payments: stats.data?.payments.pending ?? 0,
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-200">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#09090b]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
          <span className="truncate font-bold text-white">StreamKaro Platform</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["platform"] })}
              className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-800"
              aria-label="Refresh data"
            >
              <RefreshCw className={cn("h-4 w-4", queryClient.isFetching() > 0 && "animate-spin")} />
            </button>
            <button
              onClick={async () => {
                await fetch("/api/admin/auth/logout", { method: "POST" });
                location.reload();
              }}
              className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6">
        <aside className="hidden w-52 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1" aria-label="Platform sections">
            {NAV.map((item) => (
              <NavButton key={item.section} item={item} active={route.section === item.section} badge={badges[item.section]} onClick={() => go(item.section)} />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden" aria-label="Platform sections">
            {NAV.map((item) => (
              <NavButton key={item.section} item={item} active={route.section === item.section} badge={badges[item.section]} onClick={() => go(item.section)} compact />
            ))}
          </nav>

          {stats.isError && (
            <div className="mb-4">
              <ErrorBox error={stats.error} onRetry={() => stats.refetch()} />
            </div>
          )}

          {route.section === "dashboard" && <DashboardSection stats={stats.data} />}
          {route.section === "organizations" && <OrganizationsSection />}
          {route.section === "customers" && (route.id ? <CustomerDetailView customerId={route.id} /> : <CustomersSection />)}
          {route.section === "subscriptions" && <SubscriptionsSection />}
          {route.section === "plans" && <PlansSection />}
          {route.section === "sources" && <ContentSourcesSection />}
          {route.section === "channels" && <ChannelHealthSection />}
          {route.section === "payments" && <PaymentsSection />}
          {route.section === "audit" && <AuditSection />}
        </main>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  badge,
  onClick,
  compact = false,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  badge?: number;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
        compact ? "px-3 py-2" : "w-full px-3 py-2",
        active ? "bg-amber-500/15 font-medium text-amber-200" : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{item.label}</span>
      {!!badge && badge > 0 && (
        <span className="ml-auto rounded-full bg-amber-500/20 px-1.5 text-[11px] font-semibold text-amber-200">{badge}</span>
      )}
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-4">{children}</main>;
}

function PlatformLogin({ onDone, forbidden }: { onDone: () => void; forbidden: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(forbidden ? "This account is not platform staff." : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Incorrect username or password" : ((await res.json()).error ?? "Login failed"));
      const check = await fetch("/api/platform/stats");
      if (check.status === 403) throw new Error("This account is not platform staff.");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Center>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
            <Building2 className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Platform Console</h1>
          <p className="text-xs text-zinc-500">StreamKaro staff only</p>
        </div>
        <div className="space-y-3">
          <label className="sr-only" htmlFor="platform-user">Username</label>
          <input id="platform-user" className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" />
          <label className="sr-only" htmlFor="platform-pass">Password</label>
          <input id="platform-pass" className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
          {err && <p role="alert" className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}
          <button aria-busy={busy} className="flex h-10 w-full items-center justify-center rounded-md bg-amber-600 text-sm font-semibold text-white hover:bg-amber-500">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log in"}
          </button>
        </div>
      </form>
    </Center>
  );
}
