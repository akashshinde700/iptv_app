"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  FilterX,
  Heart,
  History,
  LayoutGrid,
  Search,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdSlot } from "@/components/tv/AdSlot";
import { ChannelCard, channelGridClass } from "@/components/tv/ChannelCard";
import { Pagination } from "@/components/tv/Pagination";
import { PlanUpsell } from "@/components/tv/PlanUpsell";
import { StateView, describeError } from "@/components/tv/StateView";
import { fetchChannels, fetchChannelsByIds, fetchMeta, fetchDemoChannels, ApiError } from "@/lib/api";
import { useMe, useSessionKey } from "@/lib/use-me";
import { useAppStore, useIsTv, type BrowseCollection, type BrowseFilters } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ChannelItem, MetaResponse } from "@/lib/types";
import { toast } from "sonner";

const PAGE_SIZE = 30;

interface RailItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  selected: boolean;
  onSelect: () => void;
}

function GridSkeleton({ isTv, count = 18 }: { isTv: boolean; count?: number }) {
  return (
    <div className={channelGridClass(isTv)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-1 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Channel list. TV / desktop: category rail on the left, grid on the right
 * (Left from the first column → rail, Right from the rail → grid). Phones: category
 * chips + a filter bottom sheet. Filters live in the store, so Back from the player
 * returns to the same category, page, scroll position and focused card.
 */
export function BrowseView() {
  const filters = useAppStore((s) => s.browseFilters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const navigate = useAppStore((s) => s.navigate);
  const favorites = useAppStore((s) => s.favorites);
  const recents = useAppStore((s) => s.recents);
  const isTv = useIsTv();

  const me = useMe();
  const hasAccess = me.data?.access.hasAccess ?? false;
  const isGuest = me.isLoading ? false : me.data?.customer == null;
  const planAllowsAdult = me.data?.customer?.plan?.allowAdult ?? false;
  const session = useSessionKey();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusFirstAfterLoad = useRef(false);

  const [searchDraft, setSearchDraft] = useState(filters.search);
  // keep local draft in sync when filters.search is set elsewhere (render-time adjustment)
  const [prevSearch, setPrevSearch] = useState(filters.search);
  if (prevSearch !== filters.search) {
    setPrevSearch(filters.search);
    setSearchDraft(filters.search);
  }
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== filters.search) setFilters({ search: searchDraft });
    }, 400);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const collection = filters.collection;

  // Facet counts reflect the OTHER active filters (pick Hindi → categories/countries
  // narrow to Hindi), so the query key + args carry those filters. keepPreviousData
  // stops the category rail from emptying while the new counts load.
  const metaQuery = useQuery({
    queryKey: ["meta", session, filters.language, filters.country, filters.category],
    queryFn: () =>
      fetchMeta({
        language: filters.language || undefined,
        country: filters.country || undefined,
        category: filters.category || undefined,
      }),
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: session !== null && !isGuest,
  });
  const meta = metaQuery.data;

  const channelsQuery = useQuery({
    queryKey: [
      "channels",
      filters.search,
      filters.country,
      filters.category,
      filters.language,
      filters.sort,
      filters.page,
      filters.nsfw,
      hasAccess,
      session,
    ],
    queryFn: () =>
      fetchChannels({
        search: filters.search || undefined,
        country: filters.country || undefined,
        category: filters.category || undefined,
        language: filters.language || undefined,
        nsfw: filters.nsfw,
        page: filters.page,
        pageSize: PAGE_SIZE,
        sort: filters.sort,
      }),
    placeholderData: keepPreviousData,
    enabled: !isGuest && hasAccess && collection === "all",
    retry: (failureCount, error) => (error instanceof ApiError && error.status === 403 ? false : failureCount < 1),
  });

  const savedIds = collection === "favorites" ? favorites : collection === "recents" ? recents : [];
  const savedQuery = useQuery({
    queryKey: ["saved", session, collection, savedIds.join(",")],
    queryFn: () => fetchChannelsByIds(savedIds),
    enabled: !isGuest && hasAccess && collection !== "all" && savedIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const savedChannels = useMemo(() => {
    const map = new Map((savedQuery.data ?? []).map((c) => [c.id, c]));
    return savedIds.map((id) => map.get(id)).filter((c): c is ChannelItem => !!c);
  }, [savedQuery.data, savedIds]);

  const items = collection === "all" ? channelsQuery.data?.items ?? [] : savedChannels;
  const contextIds = useMemo(() => items.map((c) => c.id), [items]);

  // after a page change, put the remote on the first card of the new page
  useEffect(() => {
    if (!focusFirstAfterLoad.current || !channelsQuery.data || channelsQuery.isPlaceholderData) return;
    focusFirstAfterLoad.current = false;
    resultsRef.current?.querySelector<HTMLElement>("[data-card]")?.focus({ preventScroll: true });
  }, [channelsQuery.data, channelsQuery.isPlaceholderData]);

  const changePage = (page: number) => {
    setFilters({ page });
    focusFirstAfterLoad.current = true;
    resultsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // ---------- loading gate while session resolves ----------
  if (me.isLoading) {
    return (
      <div className="mx-auto max-w-[1600px]">
        <Skeleton className="h-8 w-48" />
        <div className="mt-5">
          <GridSkeleton isTv={isTv} count={12} />
        </div>
      </div>
    );
  }

  // ---------- guest: catalog locked ----------
  if (isGuest) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-8">
        <div className="text-center">
          <h1 className={cn("font-bold tracking-tight", isTv ? "text-3xl" : "text-xl sm:text-2xl")}>Live TV catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">The full catalog and filters unlock once you have a plan.</p>
        </div>
        <PlanUpsell
          title="Filters and the full catalog come with a plan"
          subtitle="Search, country, language and category filters — all for plan members. Try the free demo channels below."
        />
        <GuestDemoRow />
      </div>
    );
  }

  const denied = !hasAccess
    ? me.data?.access.reason ?? "Access denied"
    : channelsQuery.error instanceof ApiError && channelsQuery.error.status === 403
      ? ((channelsQuery.error.data?.reason as string | undefined) ?? channelsQuery.error.message)
      : null;

  const activeFilterCount =
    (filters.search ? 1 : 0) + (filters.country ? 1 : 0) + (filters.language ? 1 : 0) + (filters.sort !== "name" ? 1 : 0);

  const categoryName = meta?.categories.find((c) => c.slug === filters.category)?.name;
  const countryName = meta?.countries.find((c) => c.code === filters.country)?.name;

  const selectCollection = (next: BrowseCollection, category = "") => setFilters({ collection: next, category });

  const railItems: RailItem[] = [
    { key: "all", label: "All channels", icon: LayoutGrid, selected: collection === "all" && !filters.category, onSelect: () => selectCollection("all") },
    { key: "favorites", label: "Favorites", icon: Heart, count: favorites.length, selected: collection === "favorites", onSelect: () => selectCollection("favorites") },
    { key: "recents", label: "Recently watched", icon: History, count: recents.length, selected: collection === "recents", onSelect: () => selectCollection("recents") },
    ...(meta?.categories ?? []).map((c) => ({
      key: `cat-${c.slug}`,
      label: c.name,
      count: c.count,
      selected: collection === "all" && filters.category === c.slug,
      onSelect: () => selectCollection("all", c.slug),
    })),
  ];

  const title =
    collection === "favorites" ? "Favorites" : collection === "recents" ? "Recently watched" : categoryName ?? "All channels";

  const subtitle =
    collection !== "all"
      ? `${savedIds.length} saved on this device`
      : channelsQuery.isLoading
        ? "Loading…"
        : `${(channelsQuery.data?.total ?? 0).toLocaleString("en-IN")} channels${countryName ? ` from ${countryName}` : ""}${
            filters.language ? ` in ${filters.language}` : ""
          }${filters.search ? ` matching “${filters.search}”` : ""}`;

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className={cn("font-bold tracking-tight", isTv ? "text-3xl" : "text-xl sm:text-2xl")}>{title}</h1>
          <p className={cn("mt-0.5 text-muted-foreground", isTv ? "text-base" : "text-sm")} aria-live="polite">
            {subtitle}
            {me.data?.customer?.plan?.name ? ` • Plan: ${me.data.customer.plan.name}` : ""}
          </p>
        </div>

        {planAllowsAdult && collection === "all" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="nsfw-toggle" className="text-xs text-muted-foreground">
              18+ content
            </Label>
            <Switch
              id="nsfw-toggle"
              checked={filters.nsfw}
              onCheckedChange={(v) => {
                setFilters({ nsfw: v });
                if (v) toast.warning("18+ channels enabled. Viewer discretion advised.");
              }}
              aria-label="Include adult channels"
            />
          </div>
        )}
      </div>

      <div className={cn("mt-4", isTv ? "grid grid-cols-[15rem_minmax(0,1fr)] gap-7" : "lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6")}>
        {/* Category rail (TV + desktop) */}
        <nav
          aria-label="Categories"
          data-nav-group="rail"
          className={cn(
            "thin-scrollbar sticky top-4 max-h-[calc(100vh-2rem)] self-start overflow-y-auto pb-4 pr-1",
            isTv ? "block" : "hidden lg:block"
          )}
        >
          <ul className="space-y-1">
            {railItems.map((item, idx) => (
              <li key={item.key}>
                {idx === 3 && (
                  <p className={cn("px-3 pb-1 pt-4 font-semibold uppercase tracking-wider text-muted-foreground/80", isTv ? "text-sm" : "text-[11px]")}>
                    Categories
                  </p>
                )}
                <RailButton item={item} isTv={isTv} />
              </li>
            ))}
            {metaQuery.isError && (
              <li className="px-1 pt-3">
                <button
                  onClick={() => metaQuery.refetch()}
                  className={cn(
                    "tv-fill-focus flex w-full items-center rounded-lg border border-dashed border-border/70 px-3 text-left text-muted-foreground outline-none hover:text-foreground focus-visible:bg-primary focus-visible:text-primary-foreground",
                    isTv ? "h-12 text-base" : "h-10 text-sm"
                  )}
                >
                  Categories didn&apos;t load — Retry
                </button>
              </li>
            )}
            {metaQuery.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <li key={`sk-${i}`}>
                  <Skeleton className={cn("w-full rounded-lg", isTv ? "h-12" : "h-10")} />
                </li>
              ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {/* Category chips (phones / tablets) */}
          {!isTv && (
            <div className="no-scrollbar -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:hidden" role="tablist" aria-label="Categories">
              {railItems.map((item) => (
                <button
                  key={item.key}
                  role="tab"
                  aria-selected={item.selected}
                  onClick={item.onSelect}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    item.selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-card/60 text-muted-foreground active:text-foreground"
                  )}
                >
                  {item.icon && <item.icon className="h-4 w-4" aria-hidden />}
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {/* Toolbar */}
          {collection === "all" && !denied && (
            <div className={cn("mb-4 flex flex-wrap items-center gap-2", !isTv && "sticky top-14 z-20 -mx-3 bg-background/90 px-3 py-2 backdrop-blur-md md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none")}>
              {isTv ? (
                <Button variant="outline" className="h-12 rounded-full px-5 text-base" onClick={() => navigate({ name: "search" })}>
                  <Search className="mr-2 h-5 w-5" /> Search
                </Button>
              ) : (
                <div className="relative min-w-[10rem] flex-1 md:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="Filter by name…"
                    className="h-10 bg-muted/50 pl-9"
                    aria-label="Filter channels by name"
                    enterKeyHint="search"
                  />
                </div>
              )}

              {!isTv && meta && (
                <div className="hidden items-center gap-2 md:flex">
                  <Select value={filters.country || "all"} onValueChange={(v) => setFilters({ country: v === "all" ? "" : v })}>
                    <SelectTrigger className="h-10 w-[9rem] rounded-md bg-muted/50" aria-label="Filter by country">
                      <SelectValue placeholder="Country" />
                    </SelectTrigger>
                    <SelectContent className="thin-scrollbar max-h-72">
                      <SelectItem value="all">All countries</SelectItem>
                      {meta.countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.flag} {c.name} ({c.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.language || "all"} onValueChange={(v) => setFilters({ language: v === "all" ? "" : v })}>
                    <SelectTrigger className="h-10 w-[9rem] rounded-md bg-muted/50" aria-label="Filter by language">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent className="thin-scrollbar max-h-72">
                      <SelectItem value="all">All languages</SelectItem>
                      {meta.languages.map((l) => (
                        <SelectItem key={l.name} value={l.name}>
                          {l.name} ({l.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as BrowseFilters["sort"] })}>
                    <SelectTrigger className="h-10 w-[7.5rem] rounded-md bg-muted/50" aria-label="Sort order">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">A to Z</SelectItem>
                      <SelectItem value="nameDesc">Z to A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                variant="outline"
                className={cn("rounded-full", isTv ? "h-12 px-5 text-base" : "h-10 md:hidden")}
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal className={cn("mr-2", isTv ? "h-5 w-5" : "h-4 w-4")} />
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>

              {(activeFilterCount > 0 || filters.category) && (
                <Button
                  variant="ghost"
                  className={cn("rounded-full text-muted-foreground hover:text-foreground", isTv ? "h-12 px-5 text-base" : "h-10")}
                  onClick={resetFilters}
                >
                  <FilterX className="mr-1.5 h-4 w-4" /> Clear
                </Button>
              )}
            </div>
          )}

          <div ref={resultsRef} className="scroll-mt-24" data-nav-group="grid">
            <Results
              isTv={isTv}
              collection={collection}
              denied={denied}
              items={items}
              contextIds={contextIds}
              loading={collection === "all" ? channelsQuery.isLoading : savedQuery.isLoading && savedIds.length > 0}
              error={collection === "all" ? channelsQuery.error : savedQuery.error}
              savedEmpty={collection !== "all" && savedIds.length === 0}
              onRetry={() => (collection === "all" ? channelsQuery.refetch() : savedQuery.refetch())}
              onClear={resetFilters}
              onShowAll={() => selectCollection("all")}
            />
          </div>

          {collection === "all" && !denied && channelsQuery.data && (
            <Pagination page={channelsQuery.data.page} totalPages={channelsQuery.data.totalPages} onChange={changePage} />
          )}
        </div>
      </div>

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        side={isTv ? "right" : "bottom"}
        meta={meta}
        filters={filters}
        total={channelsQuery.data?.total}
        onChange={setFilters}
        onClear={resetFilters}
        isTv={isTv}
      />

      <AdSlot slotId="browse-footer" />
    </div>
  );
}

function RailButton({ item, isTv }: { item: RailItem; isTv: boolean }) {
  const Icon = item.icon;
  return (
    <button
      onClick={item.onSelect}
      data-focus-key={`rail-${item.key}`}
      data-selected={item.selected || undefined}
      aria-current={item.selected ? "true" : undefined}
      className={cn(
        "tv-fill-focus relative flex w-full items-center gap-2.5 rounded-lg px-3 text-left font-medium outline-none transition-colors",
        isTv ? "h-12 text-lg" : "h-10 text-sm",
        item.selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        "focus-visible:bg-primary focus-visible:text-primary-foreground"
      )}
    >
      {item.selected && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-current" aria-hidden />}
      {Icon && <Icon className={cn("shrink-0", isTv ? "h-5 w-5" : "h-4 w-4")} aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className={cn("shrink-0 tabular-nums opacity-70", isTv ? "text-sm" : "text-xs")}>{item.count.toLocaleString("en-IN")}</span>
      )}
    </button>
  );
}

function Results({
  isTv,
  collection,
  denied,
  items,
  contextIds,
  loading,
  error,
  savedEmpty,
  onRetry,
  onClear,
  onShowAll,
}: {
  isTv: boolean;
  collection: BrowseCollection;
  denied: string | null;
  items: ChannelItem[];
  contextIds: string[];
  loading: boolean;
  error: unknown;
  savedEmpty: boolean;
  onRetry: () => void;
  onClear: () => void;
  onShowAll: () => void;
}) {
  const navigate = useAppStore((s) => s.navigate);

  if (denied) {
    return (
      <StateView icon={ShieldAlert} tone="warning" title="Your plan is not active" message={`${denied} — renew your plan to watch the full catalog.`}>
        <Button className="rounded-full" data-autofocus onClick={() => navigate({ name: "premium" })}>
          View plans
        </Button>
        <Button variant="outline" className="rounded-full" onClick={() => navigate({ name: "account" })}>
          My account
        </Button>
      </StateView>
    );
  }

  if (savedEmpty) {
    return collection === "favorites" ? (
      <StateView icon={Heart} tone="primary" title="No favorites yet" message="Save channels from the player to find them here quickly.">
        <Button className="rounded-full" onClick={onShowAll}>
          All channels
        </Button>
      </StateView>
    ) : (
      <StateView icon={History} tone="primary" title="Nothing watched yet" message="Channels you watch will show up here.">
        <Button className="rounded-full" onClick={onShowAll}>
          All channels
        </Button>
      </StateView>
    );
  }

  if (loading) return <GridSkeleton isTv={isTv} />;

  if (error) {
    const described = describeError(error, "Something went wrong while loading channels.");
    return (
      <StateView icon={described.icon} tone="error" title={described.title} message={described.message}>
        <Button className="rounded-full" onClick={onRetry}>
          Try again
        </Button>
      </StateView>
    );
  }

  if (items.length === 0) {
    return (
      <StateView icon={SearchX} title="No channels found" message="Try another category, or remove some filters.">
        <Button className="rounded-full" onClick={onClear}>
          Clear all filters
        </Button>
      </StateView>
    );
  }

  return (
    <div className={channelGridClass(isTv)}>
      {items.map((channel, i) => (
        <ChannelCard key={channel.id} channel={channel} contextIds={contextIds} autoFocus={i === 0} />
      ))}
    </div>
  );
}

function OptionGroup({
  label,
  options,
  value,
  onChange,
  isTv,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  isTv: boolean;
}) {
  return (
    <section aria-label={label} className="space-y-2">
      <h3 className={cn("font-semibold", isTv ? "text-lg" : "text-sm")}>{label}</h3>
      <div className="thin-scrollbar flex max-h-56 flex-wrap gap-2 overflow-y-auto p-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value || "all"}
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              data-selected={selected || undefined}
              className={cn(
                "rounded-full border font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                isTv ? "px-4 py-2 text-base" : "px-3 py-1.5 text-sm",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FilterSheet({
  open,
  onOpenChange,
  side,
  meta,
  filters,
  total,
  onChange,
  onClear,
  isTv,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "right" | "bottom";
  meta: MetaResponse | undefined;
  filters: BrowseFilters;
  total: number | undefined;
  onChange: (patch: Partial<BrowseFilters>) => void;
  onClear: () => void;
  isTv: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn("thin-scrollbar overflow-y-auto", side === "bottom" ? "max-h-[85vh] rounded-t-2xl" : isTv ? "w-[34rem] sm:max-w-[34rem]" : "")}
      >
        <SheetHeader>
          <SheetTitle className={isTv ? "text-2xl" : undefined}>Filters</SheetTitle>
          <SheetDescription>Results update as you choose.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4">
          <OptionGroup
            label="Sort"
            isTv={isTv}
            value={filters.sort}
            onChange={(v) => onChange({ sort: v as BrowseFilters["sort"] })}
            options={[
              { value: "name", label: "A to Z" },
              { value: "nameDesc", label: "Z to A" },
            ]}
          />
          {meta && meta.categories.length > 0 && !isTv && (
            <OptionGroup
              label="Category"
              isTv={isTv}
              value={filters.category}
              onChange={(v) => onChange({ category: v, collection: "all" })}
              options={[{ value: "", label: "All" }, ...meta.categories.map((c) => ({ value: c.slug, label: c.name }))]}
            />
          )}
          {meta && meta.countries.length > 0 && (
            <OptionGroup
              label="Country"
              isTv={isTv}
              value={filters.country}
              onChange={(v) => onChange({ country: v })}
              options={[{ value: "", label: "All" }, ...meta.countries.map((c) => ({ value: c.code, label: `${c.flag ?? ""} ${c.name}`.trim() }))]}
            />
          )}
          {meta && meta.languages.length > 0 && (
            <OptionGroup
              label="Language"
              isTv={isTv}
              value={filters.language}
              onChange={(v) => onChange({ language: v })}
              options={[{ value: "", label: "All" }, ...meta.languages.map((l) => ({ value: l.name, label: l.name }))]}
            />
          )}
        </div>
        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1 rounded-full" onClick={onClear}>
            <FilterX className="mr-1.5 h-4 w-4" /> Clear
          </Button>
          <Button className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>
            Show {total !== undefined ? total.toLocaleString("en-IN") : ""} channels
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Guests still get to try the free demo channels from the browse page. */
function GuestDemoRow() {
  const isTv = useIsTv();
  const { data, isLoading } = useQuery({
    queryKey: ["demo-channels"],
    queryFn: fetchDemoChannels,
    staleTime: 5 * 60 * 1000,
  });
  const ids = useMemo(() => (data?.items ?? []).map((c) => c.id), [data]);

  if (!isLoading && (data?.items.length ?? 0) === 0) return null;

  return (
    <div>
      <h2 className={cn("mb-3 font-bold tracking-tight", isTv ? "text-2xl" : "text-base sm:text-lg")}>Free demo channels</h2>
      {isLoading ? (
        <GridSkeleton isTv={isTv} count={4} />
      ) : (
        <div className={channelGridClass(isTv)}>
          {data?.items.map((channel) => <ChannelCard key={channel.id} channel={channel} contextIds={ids} />)}
        </div>
      )}
    </div>
  );
}
