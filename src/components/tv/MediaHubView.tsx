"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Info,
  Play,
  Search,
  SearchX,
  Star,
  Tv,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanUpsell } from "@/components/tv/PlanUpsell";
import { StateView, describeError } from "@/components/tv/StateView";
import { ApiError } from "@/lib/api";
import { fetchMediaHome, fetchMediaSearch, type MediaCard, type MediaTab } from "@/lib/media";
import { cn } from "@/lib/utils";
import { useAppStore, useIsTv } from "@/lib/store";
import { useSessionKey } from "@/lib/use-me";

/**
 * The media hub: a provider-driven "For you" front page (hero carousel + poster rails)
 * with Movies / TV Shows tabs and instant search.
 *
 * Which titles appear is decided server-side (own Xtream catalog by default, an optional
 * third-party adapter when the operator enables it) — this component only renders what
 * the plan-gated API returns.
 */
export function MediaHubView() {
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();
  const session = useSessionKey();
  const [tab, setTab] = useState<MediaTab>("home");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const recentMovies = useAppStore((store) => store.recentMovies);
  const progress = useAppStore((store) => store.progress);

  const home = useQuery({
    queryKey: ["media-home", session, tab],
    queryFn: () => fetchMediaHome(tab),
    enabled: session !== null,
    placeholderData: keepPreviousData,
    retry: (n, e) => (e instanceof ApiError && e.status === 403 ? false : n < 1),
  });

  const search = useQuery({
    queryKey: ["media-search", session, query],
    queryFn: () => fetchMediaSearch(query),
    enabled: session !== null && query.length >= 2,
    placeholderData: keepPreviousData,
  });

  const open = (card: MediaCard) => navigate({ name: "title", id: card.id });

  if (home.isError && home.error instanceof ApiError && home.error.status === 403) {
    return (
      <PlanUpsell
        title="Movies & shows need a plan"
        subtitle="The whole on-demand catalog — movies, TV shows and every season — unlocks with any active plan."
      />
    );
  }

  const data = home.data;
  const tabs = data?.tabs ?? [
    { key: "home" as MediaTab, label: "For you" },
    { key: "movies" as MediaTab, label: "Movies" },
    { key: "series" as MediaTab, label: "TV Shows" },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className={cn("flex items-center gap-2 font-bold tracking-tight", isTv ? "text-3xl" : "text-xl")}>
          <Clapperboard className="h-6 w-6 text-primary" /> Movies &amp; Shows
        </h1>
        {data?.geo && (
          <Badge variant="secondary" className="rounded-full bg-muted/70 text-[11px]">
            {data.geo.name}
          </Badge>
        )}
        <form
          className="relative ml-auto w-full min-w-[220px] sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(draft.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.trim().length < 2) setQuery("");
            }}
            placeholder="Search movies & shows…"
            className="rounded-full pl-9"
            aria-label="Search movies and shows"
          />
        </form>
      </header>

      {query.length >= 2 ? (
        <SearchResults
          query={query}
          items={search.data?.items ?? []}
          loading={search.isLoading}
          onOpen={open}
          onClear={() => {
            setQuery("");
            setDraft("");
          }}
        />
      ) : home.isPending ? (
        <HubSkeleton isTv={isTv} />
      ) : home.isError ? (
        <StateView
          icon={describeError(home.error, "The movie catalog couldn't be loaded.").icon}
          tone="error"
          title={describeError(home.error, "").title}
          message={describeError(home.error, "Try again in a moment.").message}
        >
          <Button className="rounded-full" onClick={() => home.refetch()}>
            Retry
          </Button>
        </StateView>
      ) : (data?.hero.length ?? 0) === 0 && (data?.rails.length ?? 0) === 0 ? (
        <StateView
          icon={Film}
          title="No titles yet"
          message="Your sources haven't delivered any movies or series. Add an Xtream source, then run Movies + Series sync from the admin panel."
          tone="primary"
        />
      ) : (
        <>
          {data && data.hero.length > 0 && <HeroCarousel items={data.hero} onOpen={open} onPlay={open} />}

          <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Media sections">
            {tabs.map((item) => (
              <Button
                key={item.key}
                role="tab"
                aria-selected={tab === item.key}
                variant={tab === item.key ? "default" : "outline"}
                className={cn("rounded-full", isTv ? "h-12 px-6 text-base" : "h-9 text-sm")}
                onClick={() => setTab(item.key)}
              >
                {item.key === "movies" ? <Film className="mr-1.5 h-4 w-4" /> : item.key === "series" ? <Tv className="mr-1.5 h-4 w-4" /> : null}
                {item.label}
              </Button>
            ))}
          </div>

          <ContinueWatching recents={recentMovies} progress={progress} onOpen={open} />

          <div className="mt-2">
            {(data?.rails ?? []).map((rail, index) => (
              <PosterRail
                key={rail.key}
                title={rail.title}
                items={rail.items}
                onOpen={open}
                autoFocusFirst={index === 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------- continue watching ---------------------------- */

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:00` : `${m} min`;
}

/**
 * Titles the viewer left unfinished. Positions are per title *and* per episode, keyed by the
 * media id the player was opened with, so a series shows up as soon as any episode has one.
 */
function ContinueWatching({
  recents,
  progress,
  onOpen,
}: {
  recents: { id: string; title: string; poster: string | null; year: string | null; rating: string | null }[];
  progress: Record<string, { seconds: number; duration: number }>;
  onOpen: (card: MediaCard) => void;
}) {
  const isTv = useIsTv();
  const items = recents
    .map((movie) => {
      const direct = progress[movie.id];
      const episodeKey = Object.keys(progress).find((key) => key.startsWith(`${movie.id}:S`));
      const position = direct ?? (episodeKey ? progress[episodeKey] : undefined);
      if (!position) return null;
      const percent = position.duration > 0 ? Math.min(100, Math.round((position.seconds / position.duration) * 100)) : 0;
      return { movie, position, percent, episodeKey };
    })
    .filter((entry): entry is { movie: (typeof recents)[number]; position: { seconds: number; duration: number }; percent: number; episodeKey: string | undefined } => entry !== null)
    .slice(0, 10);

  if (items.length === 0) return null;

  return (
    <section className={isTv ? "mt-8" : "mt-7"} aria-label="Continue watching">
      <h2 className={cn("mb-2 font-bold tracking-tight", isTv ? "text-2xl" : "text-base sm:text-lg")}>Continue watching</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(({ movie, position, percent }) => (
          <button
            key={movie.id}
            type="button"
            onClick={() =>
              onOpen({
                id: movie.id,
                provider: movie.id.startsWith("nxsha:") ? "nxsha" : "catalog",
                kind: movie.id.includes(":series:") ? "series" : "movie",
                title: movie.title,
                poster: movie.poster,
                backdrop: null,
                year: movie.year,
                rating: movie.rating,
                plot: null,
                badges: [],
              })
            }
            data-focus-key={`resume-${movie.id}`}
            className={cn(
              "shrink-0 snap-start overflow-hidden rounded-xl border border-border/40 bg-zinc-900/60 text-left outline-none transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
              isTv ? "w-[15rem]" : "w-[46%] sm:w-[13rem]",
            )}
          >
            <div className="relative aspect-video w-full bg-zinc-800">
              {movie.poster ? (
                <img src={movie.poster} alt="" loading="lazy" className="h-full w-full object-cover opacity-80" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                  <Film className="h-6 w-6" />
                </div>
              )}
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                  <Play className="ml-0.5 h-4 w-4 fill-current" />
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
              </span>
            </div>
            <div className="p-2">
              <p className={cn("truncate font-semibold", isTv ? "text-base" : "text-xs sm:text-sm")}>{movie.title}</p>
              <p className="text-[11px] text-muted-foreground">{formatClock(position.seconds)} watched</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- hero ------------------------------------- */

function HeroCarousel({ items, onOpen, onPlay }: { items: MediaCard[]; onOpen: (c: MediaCard) => void; onPlay: (c: MediaCard) => void }) {
  const isTv = useIsTv();
  const [index, setIndex] = useState(0);
  const count = items.length;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 7000);
    return () => clearInterval(timer);
  }, [count]);

  // the list can shrink when the tab changes — never render an out-of-range hero
  const safeIndex = index % Math.max(1, count);
  const current = items[safeIndex];
  if (!current) return null;

  const artwork = current.backdrop ?? current.poster;

  return (
    <section
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/50 bg-zinc-950",
        isTv ? "h-[420px]" : "h-[300px] sm:h-[380px]",
      )}
      aria-label="Featured titles"
    >
      {artwork ? (
        <img src={artwork} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-950/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-950/20 to-transparent" />

      <div className="relative z-10 flex h-full max-w-2xl flex-col justify-end gap-2 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
            Featured
          </Badge>
          {current.rating && (
            <span className="flex items-center gap-1 text-xs text-amber-300">
              <Star className="h-3 w-3 fill-current" /> {current.rating}
            </span>
          )}
          {current.year && <span className="text-xs text-zinc-300">{current.year}</span>}
          <span className="text-xs text-zinc-300">{current.kind === "series" ? "TV Show" : "Movie"}</span>
        </div>
        <h2 className={cn("font-bold leading-tight text-white line-clamp-2", isTv ? "text-4xl" : "text-2xl sm:text-3xl")}>
          {current.title}
        </h2>
        {current.plot && <p className="line-clamp-2 max-w-xl text-xs text-zinc-300 sm:text-sm">{current.plot}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            className="rounded-full"
            size={isTv ? "lg" : "default"}
            data-autofocus
            data-focus-key={`hero-play-${current.id}`}
            onClick={() => onPlay(current)}
          >
            <Play className="mr-1.5 h-4 w-4 fill-current" /> {current.kind === "series" ? "Open show" : "Watch now"}
          </Button>
          <Button
            variant="outline"
            className="rounded-full border-white/30 bg-black/40 text-white hover:bg-white/15 hover:text-white"
            size={isTv ? "lg" : "default"}
            data-focus-key={`hero-info-${current.id}`}
            onClick={() => onOpen(current)}
          >
            <Info className="mr-1.5 h-4 w-4" /> More info
          </Button>
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous featured title"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 outline-none transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next featured title"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 outline-none transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 right-4 z-20 flex gap-1.5">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Featured ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn("h-1.5 rounded-full transition-all", i === safeIndex ? "w-6 bg-primary" : "w-1.5 bg-zinc-500")}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------- rails ------------------------------------ */

function PosterRail({
  title,
  items,
  onOpen,
  autoFocusFirst,
}: {
  title: string;
  items: MediaCard[];
  onOpen: (c: MediaCard) => void;
  autoFocusFirst: boolean;
}) {
  const isTv = useIsTv();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * scrollerRef.current.clientWidth * 0.8, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <section className={isTv ? "mt-8" : "mt-7"} aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className={cn("font-bold tracking-tight", isTv ? "text-2xl" : "text-base sm:text-lg")}>{title}</h2>
        {!isTv && (
          <div className="hidden items-center gap-1 sm:flex">
            <Button variant="outline" size="icon" tabIndex={-1} className="h-7 w-7 rounded-full" onClick={() => scrollBy(-1)} aria-label={`Scroll ${title} left`}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" tabIndex={-1} className="h-7 w-7 rounded-full" onClick={() => scrollBy(1)} aria-label={`Scroll ${title} right`}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div
        ref={scrollerRef}
        data-nav-group={title}
        className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((card, index) => (
          <PosterCard key={card.id} card={card} onOpen={() => onOpen(card)} autoFocus={autoFocusFirst && index === 0} />
        ))}
      </div>
    </section>
  );
}

export function PosterCard({ card, onOpen, autoFocus = false }: { card: MediaCard; onOpen: () => void; autoFocus?: boolean }) {
  const isTv = useIsTv();
  const [broken, setBroken] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      data-focus-key={`media-${card.id}`}
      data-autofocus={autoFocus || undefined}
      className={cn(
        "group/card shrink-0 snap-start overflow-hidden rounded-xl border border-border/40 bg-zinc-900/60 text-left outline-none transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
        isTv ? "w-[12.5rem]" : "w-[42%] sm:w-[10.5rem]",
      )}
      aria-label={`${card.title}${card.year ? ` (${card.year})` : ""}`}
    >
      <div className="relative aspect-[2/3] w-full">
        {card.poster && !broken ? (
          <img
            src={card.poster}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-3 text-center text-muted-foreground/70">
            {card.kind === "series" ? <Tv className="h-7 w-7" /> : <Film className="h-7 w-7" />}
            <span className="line-clamp-3 text-xs font-semibold text-white/80">{card.title}</span>
          </div>
        )}
        {card.rating && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
            <Star className="h-2.5 w-2.5 fill-current" /> {card.rating}
          </span>
        )}
        {card.kind === "series" && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">SERIES</span>
        )}
      </div>
      <div className="p-2">
        <p className={cn("truncate font-semibold text-foreground", isTv ? "text-base" : "text-xs sm:text-sm")}>{card.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[card.year, card.badges[0]].filter(Boolean).join(" · ") || (card.kind === "series" ? "TV Show" : "Movie")}
        </p>
      </div>
    </button>
  );
}

/* ------------------------------- search ----------------------------------- */

function SearchResults({
  query,
  items,
  loading,
  onOpen,
  onClear,
}: {
  query: string;
  items: MediaCard[];
  loading: boolean;
  onOpen: (c: MediaCard) => void;
  onClear: () => void;
}) {
  const isTv = useIsTv();

  if (loading) {
    return (
      <div className={cn("grid gap-3", isTv ? "grid-cols-5" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6")}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <StateView icon={SearchX} title={`No results for “${query}”`} message="Try a shorter title, or check your sources have synced.">
        <Button variant="outline" className="rounded-full" onClick={onClear}>
          Clear search
        </Button>
      </StateView>
    );
  }

  return (
    <div className={cn("grid gap-3", isTv ? "grid-cols-5 lg:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6")}>
      {items.map((card, index) => (
        <PosterCard key={card.id} card={card} onOpen={() => onOpen(card)} autoFocus={index === 0} />
      ))}
    </div>
  );
}

function HubSkeleton({ isTv }: { isTv: boolean }) {
  const widths = useMemo(() => (isTv ? 5 : 6), [isTv]);
  return (
    <div>
      <Skeleton className={cn("w-full rounded-2xl", isTv ? "h-[420px]" : "h-[300px]")} />
      <Skeleton className="mt-6 h-8 w-40" />
      <div className="mt-3 flex gap-3 overflow-hidden">
        {Array.from({ length: widths }).map((_, i) => (
          <Skeleton key={i} className={cn("shrink-0 rounded-xl", isTv ? "h-[18rem] w-[12.5rem]" : "h-56 w-[10.5rem]")} />
        ))}
      </div>
    </div>
  );
}
