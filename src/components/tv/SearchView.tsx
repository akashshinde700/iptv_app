"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, Loader2, Lock, Search, SearchX, Tv, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelCard, channelGridClass } from "@/components/tv/ChannelCard";
import { StateView, describeError } from "@/components/tv/StateView";
import { ApiError, fetchChannels, fetchDemoChannels, fetchMeta } from "@/lib/api";
import { useAppStore, useIsTv } from "@/lib/store";
import { useMe, useSessionKey } from "@/lib/use-me";
import { cn } from "@/lib/utils";

const MIN_CHARS = 2;
const RECENT_KEY = "sk-recent-searches";

function readRecentSearches(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function rememberSearch(query: string) {
  try {
    const next = [query, ...readRecentSearches().filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
}

/**
 * Dedicated search screen. The query lives in the store, so Back from the player
 * returns here with the same results, scroll position and focused card.
 * Results update ~350 ms after typing stops (no request per keystroke).
 */
export function SearchView() {
  const query = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const navigate = useAppStore((s) => s.navigate);
  const setFilters = useAppStore((s) => s.setFilters);
  const isTv = useIsTv();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(query);
  const [recentSearches, setRecentSearches] = useState(readRecentSearches);

  const me = useMe();
  const hasAccess = me.data?.access.hasAccess ?? false;
  const isGuest = !me.isLoading && me.data?.customer == null;
  const session = useSessionKey();

  useEffect(() => {
    const t = setTimeout(() => {
      const next = draft.trim();
      if (next !== query) setSearchQuery(next);
    }, 350);
    return () => clearTimeout(t);
  }, [draft]);

  const active = query.length >= MIN_CHARS;

  const results = useQuery({
    queryKey: ["search", session, query],
    queryFn: () => fetchChannels({ search: query, pageSize: 48 }),
    enabled: active && hasAccess,
    placeholderData: keepPreviousData,
    retry: (count, error) => (error instanceof ApiError && error.status === 403 ? false : count < 1),
  });

  // guests can still search the free demo channels
  const demo = useQuery({
    queryKey: ["demo-channels"],
    queryFn: fetchDemoChannels,
    enabled: isGuest,
    staleTime: 5 * 60 * 1000,
  });
  const meta = useQuery({
    queryKey: ["meta", session],
    queryFn: () => fetchMeta(),
    staleTime: 10 * 60 * 1000,
    enabled: hasAccess && session !== null,
  });

  const items = useMemo(() => {
    if (!active) return [];
    if (hasAccess) return results.data?.items ?? [];
    const needle = query.toLowerCase();
    return (demo.data?.items ?? []).filter((c) => c.name.toLowerCase().includes(needle));
  }, [active, hasAccess, results.data, demo.data, query]);
  const ids = useMemo(() => items.map((c) => c.id), [items]);

  const loading = active && (hasAccess ? results.isLoading : demo.isLoading);
  const updating = hasAccess && results.isFetching && !results.isLoading;

  // remember searches that found something — shown next time, so TV users type less
  useEffect(() => {
    if (active && !loading && items.length > 0) rememberSearch(query);
  }, [active, loading, items.length, query]);

  return (
    <div className="mx-auto max-w-[1600px]">
      <h1 className="sr-only">Search channels</h1>

      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          setSearchQuery(draft.trim());
          // phones: hide the keyboard so the results are visible
          if (!isTv) inputRef.current?.blur();
        }}
      >
        <Search
          className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground", isTv ? "left-5 h-7 w-7" : "left-4 h-5 w-5")}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search channels by name"
          aria-label="Search channels"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-autofocus
          className={cn(
            "w-full rounded-2xl border border-border/70 bg-muted/40 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-muted/60",
            isTv ? "h-20 pl-16 pr-16 text-3xl" : "h-14 pl-12 pr-12 text-lg"
          )}
        />
        {(updating || (draft && !updating)) && (
          <span className={cn("absolute top-1/2 -translate-y-1/2", isTv ? "right-5" : "right-3")}>
            {updating ? (
              <Loader2 className={cn("animate-spin text-primary", isTv ? "h-7 w-7" : "h-5 w-5")} aria-label="Updating results" />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setSearchQuery("");
                  inputRef.current?.focus();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </span>
        )}
      </form>

      <div className="mt-6" aria-live="polite">
        {!active ? (
          <div>
            <p className={cn("text-muted-foreground", isTv ? "text-lg" : "text-sm")}>
              {draft.trim().length > 0 ? `Type at least ${MIN_CHARS} letters.` : "Find a channel by its name — for example “news” or “sports”."}
            </p>
            {recentSearches.length > 0 && (
              <section className="mt-6" aria-label="Recent searches">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className={cn("font-bold", isTv ? "text-2xl" : "text-base")}>Recent searches</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-muted-foreground"
                    onClick={() => {
                      try {
                        localStorage.removeItem(RECENT_KEY);
                      } catch {
                        /* storage blocked */
                      }
                      setRecentSearches([]);
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2" data-nav-group="recent-searches">
                  {recentSearches.map((q) => (
                    <button
                      key={q}
                      data-focus-key={`recent-search-${q}`}
                      onClick={() => {
                        setDraft(q);
                        setSearchQuery(q);
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-full border border-border/60 bg-card/60 font-medium outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring",
                        isTv ? "px-5 py-2.5 text-base" : "px-4 py-2 text-sm"
                      )}
                    >
                      <History className="h-4 w-4 text-muted-foreground" aria-hidden /> {q}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {meta.data && meta.data.categories.length > 0 && (
              <section className="mt-6" aria-label="Browse by category">
                <h2 className={cn("mb-3 font-bold", isTv ? "text-2xl" : "text-base")}>Or browse a category</h2>
                <div className="flex flex-wrap gap-2">
                  {meta.data.categories.slice(0, 12).map((c) => (
                    <button
                      key={c.slug}
                      data-focus-key={`search-cat-${c.slug}`}
                      onClick={() => {
                        setFilters({ collection: "all", category: c.slug });
                        navigate({ name: "browse" });
                      }}
                      className={cn(
                        "rounded-full border border-border/60 bg-card/60 font-medium outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring",
                        isTv ? "px-5 py-2.5 text-base" : "px-4 py-2 text-sm"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : loading ? (
          <div aria-busy>
            <p className={cn("mb-3 text-muted-foreground", isTv ? "text-lg" : "text-sm")}>Searching channels…</p>
            <div className={channelGridClass(isTv)} aria-hidden>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="aspect-video w-full rounded-lg" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ) : hasAccess && results.isError ? (
          (() => {
            const described = describeError(results.error, "Search failed.");
            return (
              <StateView icon={described.icon} tone="error" title={described.title} message={described.message}>
                <Button className="rounded-full" onClick={() => results.refetch()}>
                  Try again
                </Button>
              </StateView>
            );
          })()
        ) : items.length === 0 ? (
          <StateView
            icon={isGuest ? Lock : SearchX}
            tone={isGuest ? "primary" : "default"}
            title={`No channels match “${query}”`}
            message={isGuest ? "Guests can only search the free demo channels. Log in to search your full plan." : "Check the spelling or try a shorter name."}
          >
            {isGuest ? (
              <Button className="rounded-full" onClick={() => navigate({ name: "account" })}>
                Log in
              </Button>
            ) : (
              <>
                <Button
                  className="rounded-full"
                  onClick={() => {
                    setDraft("");
                    setSearchQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <X className="mr-1.5 h-4 w-4" /> Clear search
                </Button>
                <Button variant="outline" className="rounded-full" onClick={() => navigate({ name: "browse" })}>
                  <Tv className="mr-1.5 h-4 w-4" /> Browse all channels
                </Button>
              </>
            )}
          </StateView>
        ) : (
          <>
            <p className={cn("mb-3 text-muted-foreground", isTv ? "text-lg" : "text-sm")}>
              {hasAccess && results.data
                ? `${results.data.total.toLocaleString("en-IN")} ${results.data.total === 1 ? "channel" : "channels"}${
                    results.data.total > items.length ? ` — showing the first ${items.length}` : ""
                  }`
                : `${items.length} demo ${items.length === 1 ? "channel" : "channels"}`}
            </p>
            <div className={channelGridClass(isTv)} data-nav-group="search-results">
              {items.map((channel) => (
                <ChannelCard key={channel.id} channel={channel} contextIds={ids} focusKey={`search-ch-${channel.id}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
