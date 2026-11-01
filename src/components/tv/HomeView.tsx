"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Crown,
  Download,
  Globe2,
  Languages,
  LogIn,
  MonitorSmartphone,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/tv/AdSlot";
import { ChannelRow } from "@/components/tv/ChannelRow";
import { PlanUpsell } from "@/components/tv/PlanUpsell";
import { StateView, describeError } from "@/components/tv/StateView";
import { fetchChannelsByIds, fetchFeatured, fetchMeta } from "@/lib/api";
import { useMe, useSessionKey } from "@/lib/use-me";
import { useAppStore, useIsTv } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ChannelItem } from "@/lib/types";

function useOrderedChannels(ids: string[], enabled: boolean, key: string) {
  const query = useQuery({
    queryKey: [key, ids.join(",")],
    queryFn: () => fetchChannelsByIds(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const channels = useMemo(() => {
    const map = new Map((query.data ?? []).map((c) => [c.id, c]));
    return ids.map((id) => map.get(id)).filter((c): c is ChannelItem => !!c);
  }, [query.data, ids]);
  return { channels, loading: query.isLoading && enabled && ids.length > 0 };
}

export function HomeView() {
  const navigate = useAppStore((s) => s.navigate);
  const setFilters = useAppStore((s) => s.setFilters);
  const recents = useAppStore((s) => s.recents);
  const favorites = useAppStore((s) => s.favorites);
  const isApp = useAppStore((s) => s.isNativeShell || s.isElectron);
  const platform = useAppStore((s) => s.platform);
  const isTv = useIsTv();

  // server-decided access: guests get the demo showcase only
  const me = useMe();
  const hasAccess = me.data?.access.hasAccess ?? false;
  const meLoading = me.isLoading;
  const customer = me.data?.customer ?? null;
  const daysLeft = customer?.planExpiresAt
    ? Math.ceil((new Date(customer.planExpiresAt).getTime() - Date.now()) / 86_400_000)
    : null;

  const session = useSessionKey();
  const metaQuery = useQuery({
    queryKey: ["meta", session],
    queryFn: () => fetchMeta(),
    staleTime: 10 * 60 * 1000,
    enabled: session !== null,
  });
  // one query for both modes: server returns demo row for guests, plan rows for customers
  const featuredQuery = useQuery({
    queryKey: ["featured", session],
    queryFn: fetchFeatured,
    staleTime: 10 * 60 * 1000,
    enabled: session !== null,
  });
  const recent = useOrderedChannels(recents, hasAccess, `recents:${session}`);
  const favorite = useOrderedChannels(favorites, hasAccess, `favorites:${session}`);

  const meta = metaQuery.data;
  const isDemoMode = !meLoading && !hasAccess;
  const compactWelcome = isTv || isApp;

  const openRow = (params: Record<string, string>) => {
    setFilters({ collection: "all", country: params.country ?? "", category: params.category ?? "" });
    navigate({ name: "browse" });
  };

  // the row whose first card gets focus when Home opens on a TV / keyboard
  const firstRowId = isDemoMode
    ? null
    : recents.length > 0
      ? "recents"
      : favorites.length > 0
        ? "favorites"
        : featuredQuery.data?.rows[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-[1800px]">
      {compactWelcome ? (
        <WelcomeStrip
          loading={meLoading}
          isDemoMode={isDemoMode}
          name={customer ? customer.name.split(" ")[0] || customer.username : null}
          planName={hasAccess ? customer?.plan?.name ?? null : null}
          hasCustomer={!!customer}
          isTv={isTv}
        />
      ) : (
        <Hero isDemoMode={isDemoMode} meta={meta} metaLoading={metaQuery.isLoading} firstDemoId={featuredQuery.data?.rows[0]?.items[0]?.id} />
      )}

      {platform === "web" && !isTv && (
        <button
          onClick={() => navigate({ name: "download" })}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-border/50 bg-gradient-to-r from-primary/10 to-transparent p-4 text-left outline-none transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold sm:text-base">Get the app — Android, Windows &amp; TV</p>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Download it or install as a PWA — on your phone, laptop and smart TV.
              </p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
            <Download className="h-4 w-4" /> Download
          </span>
        </button>
      )}

      {hasAccess && daysLeft !== null && daysLeft <= 7 && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <CalendarClock className="h-6 w-6 shrink-0 text-amber-400" aria-hidden />
          <p className={cn("min-w-0 flex-1 font-semibold", isTv ? "text-lg" : "text-sm")}>
            {daysLeft <= 0
              ? "Your plan expires today."
              : `Your plan expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}.`}
          </p>
          <Button variant="outline" className="rounded-full" onClick={() => navigate({ name: "premium" })}>
            Renew plan
          </Button>
        </div>
      )}

      {featuredQuery.isError && (
        <StateView
          compact
          tone="error"
          icon={describeError(featuredQuery.error).icon}
          title={describeError(featuredQuery.error).title}
          message={describeError(featuredQuery.error).message}
        >
          <Button className="rounded-full" onClick={() => featuredQuery.refetch()}>
            Try again
          </Button>
        </StateView>
      )}

      {/* ---------- Guest: demo + upsell ---------- */}
      {isDemoMode && (
        <>
          {featuredQuery.isLoading && <ChannelRow id="demo-loading" title="Free demo — try it" channels={[]} loading />}
          {featuredQuery.data?.mode === "demo" &&
            featuredQuery.data.rows.map((row) => (
              <ChannelRow key={row.id} id={row.id} title={row.title} channels={row.items} />
            ))}
          {!compactWelcome && (
            <div className="mt-8">
              <PlanUpsell />
            </div>
          )}
        </>
      )}

      {/* ---------- Customer: full experience ---------- */}
      {!isDemoMode && !meLoading && (
        <>
          {recents.length > 0 && (
            <ChannelRow
              id="recents"
              title="Continue watching"
              channels={recent.channels}
              loading={recent.loading}
              onSeeAll={() => navigate({ name: "history" })}
              autoFocusFirst={firstRowId === "recents"}
            />
          )}

          {favorites.length > 0 && (
            <ChannelRow
              id="favorites"
              title="Your favorites"
              channels={favorite.channels}
              loading={favorite.loading}
              onSeeAll={() => navigate({ name: "favorites" })}
              autoFocusFirst={firstRowId === "favorites"}
            />
          )}

          {featuredQuery.isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <ChannelRow key={i} id={`loading-${i}`} title="Loading…" loading channels={[]} />
            ))}

          {featuredQuery.data?.rows.map((row, idx) => (
            <div key={row.id}>
              <ChannelRow
                id={row.id}
                title={row.title}
                channels={row.items}
                onSeeAll={() => openRow(row.params)}
                autoFocusFirst={firstRowId === row.id}
              />
              {idx === 1 && <AdSlot slotId="home-infeed-1" />}
              {idx === 4 && <AdSlot slotId="home-infeed-2" />}
            </div>
          ))}

          {/* Categories (plan-scoped facets) */}
          {meta && meta.categories.length > 0 && (
            <section className={isTv ? "mt-10" : "mt-9"} aria-label="Browse by category">
              <h2 className={cn("mb-3 font-bold tracking-tight", isTv ? "text-2xl" : "text-base sm:text-lg")}>
                Browse by category
              </h2>
              <div className="flex flex-wrap gap-2" data-nav-group="home-categories">
                {meta.categories.slice(0, isTv ? 12 : 16).map((cat) => (
                  <button
                    key={cat.slug}
                    data-focus-key={`home-cat-${cat.slug}`}
                    onClick={() => openRow({ category: cat.slug })}
                    className={cn(
                      "rounded-full border border-border/60 bg-card/60 font-medium text-foreground outline-none transition-all hover:border-primary/50 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring",
                      isTv ? "px-5 py-2.5 text-base" : "px-4 py-2 text-sm"
                    )}
                  >
                    {cat.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">{cat.count.toLocaleString("en-IN")}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Countries (plan-scoped facets) */}
          {meta && meta.countries.length > 0 && (
            <section className={isTv ? "mt-10" : "mt-9"} aria-label="Browse by country">
              <h2 className={cn("mb-3 font-bold tracking-tight", isTv ? "text-2xl" : "text-base sm:text-lg")}>
                Browse by country
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-nav-group="home-countries">
                {meta.countries.slice(0, 12).map((country) => (
                  <button
                    key={country.code}
                    data-focus-key={`home-country-${country.code}`}
                    onClick={() => openRow({ country: country.code })}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-card/60 px-4 py-3 text-left outline-none transition-all hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="text-lg leading-none">
                        {country.flag}
                      </span>
                      <span className="truncate text-sm font-semibold">{country.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{country.count.toLocaleString("en-IN")}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <AdSlot slotId="home-footer" className="mt-9" />
        </>
      )}
    </div>
  );
}

/** Apps + TV: no marketing hero — a short greeting and the next logical action. */
function WelcomeStrip({
  loading,
  isDemoMode,
  name,
  planName,
  hasCustomer,
  isTv,
}: {
  loading: boolean;
  isDemoMode: boolean;
  name: string | null;
  planName: string | null;
  hasCustomer: boolean;
  isTv: boolean;
}) {
  const navigate = useAppStore((s) => s.navigate);

  if (loading) return <Skeleton className="h-24 w-full rounded-2xl" />;

  return (
    <section
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/50 bg-gradient-to-r from-primary/12 via-card/60 to-card/30 p-5 sm:p-6"
      aria-label="Welcome"
    >
      <div className="min-w-0">
        <h1 className={cn("font-extrabold tracking-tight", isTv ? "text-3xl" : "text-2xl")}>
          {name ? `Hi, ${name}` : "Welcome to StreamKaro"}
        </h1>
        <p className={cn("mt-1 text-muted-foreground", isTv ? "text-lg" : "text-sm")}>
          {isDemoMode
            ? hasCustomer
              ? "Your plan isn't active right now — renew it to watch every channel. Demo channels are below."
              : "Log in to watch every channel in your plan. Free demo channels are below."
            : planName
              ? `Plan: ${planName}`
              : "Every channel in your plan, in one place."}
        </p>
      </div>
      <div className="ml-auto flex flex-wrap gap-3">
        {isDemoMode ? (
          <>
            <Button
              size="lg"
              className="h-12 rounded-full px-6 text-base font-bold"
              data-autofocus
              onClick={() => navigate({ name: hasCustomer ? "premium" : "account" })}
            >
              {hasCustomer ? <Crown className="mr-2 h-5 w-5" /> : <LogIn className="mr-2 h-5 w-5" />}
              {hasCustomer ? "Renew plan" : "Log in"}
            </Button>
            {!hasCustomer && (
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-full px-6 text-base"
                onClick={() => navigate({ name: "premium" })}
              >
                <Sparkles className="mr-2 h-5 w-5" /> View plans
              </Button>
            )}
          </>
        ) : (
          <>
            <Button size="lg" className="h-12 rounded-full px-6 text-base font-bold" onClick={() => navigate({ name: "browse" })}>
              <Tv className="mr-2 h-5 w-5" /> All channels
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-full px-6 text-base"
              onClick={() => navigate({ name: "search" })}
            >
              <Search className="mr-2 h-5 w-5" /> Search
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** Web marketing hero (browsers only). */
function Hero({
  isDemoMode,
  meta,
  metaLoading,
  firstDemoId,
}: {
  isDemoMode: boolean;
  meta: Awaited<ReturnType<typeof fetchMeta>> | undefined;
  metaLoading: boolean;
  firstDemoId?: string;
}) {
  const navigate = useAppStore((s) => s.navigate);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/50 sm:rounded-3xl" aria-label="Welcome">
      <img src="/icons/hero-bg.png" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />

      <div className="relative px-5 py-10 sm:px-10 sm:py-14 lg:py-20">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {meta ? (
              <>
                <span className="text-brand-gradient">{meta.totalChannels.toLocaleString("en-IN")}+ live channels.</span>{" "}
                <span className="text-foreground">{isDemoMode ? "With a plan." : "All in your plan."}</span>
              </>
            ) : (
              <span className="text-brand-gradient">Thousands of live channels.</span>
            )}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            {isDemoMode ? (
              <>
                The full catalog unlocks for plan members. Below are some{" "}
                <span className="font-semibold text-foreground">free demo channels</span> — try them first, and pick a
                plan if you like what you see.
              </>
            ) : (
              <>News, sports, movies, music and kids — every TV channel in your plan, in one app.</>
            )}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {isDemoMode ? (
              <>
                <Button
                  size="lg"
                  className="h-11 rounded-full px-6 text-sm font-bold shadow-lg shadow-primary/25"
                  onClick={() => (firstDemoId ? navigate({ name: "watch", channelId: firstDemoId }) : navigate({ name: "premium" }))}
                >
                  <Play className="mr-2 h-4 w-4 fill-current" /> Watch free demo
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 rounded-full border-border/70 bg-background/50 px-6 text-sm font-semibold backdrop-blur"
                  onClick={() => navigate({ name: "premium" })}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> View plans
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  className="h-11 rounded-full px-6 text-sm font-bold shadow-lg shadow-primary/25"
                  onClick={() => navigate({ name: "browse" })}
                >
                  <Play className="mr-2 h-4 w-4 fill-current" /> Start watching
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-11 rounded-full border-border/70 bg-background/50 px-6 text-sm font-semibold backdrop-blur"
                  onClick={() => navigate({ name: "premium" })}
                >
                  My plan
                </Button>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: ShieldCheck, label: "Dead channels removed automatically" },
              { icon: RefreshCw, label: "Server switches by itself" },
              { icon: MonitorSmartphone, label: "Watch on TV, laptop & phone" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-300/90"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </span>
            ))}
          </div>

          <dl className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
            <StatChip icon={Tv} label="Channels" value={meta?.totalChannels} loading={metaLoading} />
            <StatChip icon={Radio} label="Live streams" value={meta?.totalStreams} loading={metaLoading} />
            {!isDemoMode && (
              <>
                <StatChip icon={Globe2} label="Countries" value={meta?.countries.length} loading={metaLoading} />
                <StatChip icon={Languages} label="Languages" value={meta?.languages.length} loading={metaLoading} />
              </>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <dt className="sr-only">{label}</dt>
      <dd className="text-sm">
        {loading || value === undefined ? (
          <Skeleton className="h-4 w-12" />
        ) : (
          <>
            <span className="font-bold">{value.toLocaleString("en-IN")}</span>{" "}
            <span className="text-muted-foreground">{label.toLowerCase()}</span>
          </>
        )}
      </dd>
    </div>
  );
}
