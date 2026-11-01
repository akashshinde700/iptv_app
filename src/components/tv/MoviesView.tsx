"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Film, Lock, Search, SearchX, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StateView } from "@/components/tv/StateView";
import { fetchMovies, ApiError, type MovieItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAppStore, useIsTv } from "@/lib/store";
import { useSessionKey } from "@/lib/use-me";

const PAGE_SIZE = 30;

/** Movies (VOD) — poster grid with search + pagination. Plan-gated like the channel catalog. */
export function MoviesView() {
  const navigate = useAppStore((s) => s.navigate);
  const recentMovies = useAppStore((s) => s.recentMovies);
  const isTv = useIsTv();
  const session = useSessionKey();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["movies", session, search, page],
    queryFn: () => fetchMovies({ search: search || undefined, page, pageSize: PAGE_SIZE }),
    enabled: session !== null,
    placeholderData: keepPreviousData,
    retry: (n, e) => (e instanceof ApiError && e.status === 403 ? false : n < 1),
  });

  const submit = () => {
    setPage(1);
    setSearch(draft.trim());
  };

  if (query.isError && query.error instanceof ApiError && query.error.status === 403) {
    const guest = query.error.data?.reason === "guest";
    return (
      <StateView icon={Lock} tone="primary" title={guest ? "Movies need a plan" : "Your plan is not active"} message={query.error.message}>
        <Button className="rounded-full" data-autofocus onClick={() => navigate({ name: "premium" })}>View plans</Button>
        {guest && <Button variant="outline" className="rounded-full" onClick={() => navigate({ name: "account" })}>Log in</Button>}
      </StateView>
    );
  }

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className={cn("flex items-center gap-2 font-bold tracking-tight", isTv ? "text-3xl" : "text-xl")}>
          <Film className="h-6 w-6 text-primary" /> Movies
        </h1>
        {total > 0 && <span className="text-sm text-muted-foreground">{total.toLocaleString("en-IN")} titles</span>}
        <form
          className="relative ml-auto w-full min-w-[220px] sm:w-80"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search movies…" className="rounded-full pl-9" />
        </form>
      </div>

      {!search && recentMovies.length > 0 && (
        <section className="mb-7" aria-label="Recently watched movies">
          <h2 className={cn("mb-3 font-bold tracking-tight", isTv ? "text-2xl" : "text-base sm:text-lg")}>Recently watched</h2>
          <PosterGrid isTv={isTv}>
            {recentMovies.slice(0, 6).map((movie) => (
              <MoviePoster key={movie.id} movie={movie} onOpen={() => navigate({ name: "movie", movieId: movie.id })} />
            ))}
          </PosterGrid>
        </section>
      )}

      {query.isLoading ? (
        <PosterGrid isTv={isTv}>
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
          ))}
        </PosterGrid>
      ) : items.length === 0 ? (
        <StateView icon={SearchX} title="No movies found" message="Try a different search." />
      ) : (
        <>
          <PosterGrid isTv={isTv}>
            {items.map((m, i) => (
              <MoviePoster key={m.id} movie={m} autoFocus={i === 0} onOpen={() => navigate({ name: "movie", movieId: m.id })} />
            ))}
          </PosterGrid>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" className="rounded-full" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
              <Button variant="outline" className="rounded-full" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PosterGrid({ isTv, children }: { isTv: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-3 sm:gap-4", isTv ? "grid-cols-5 lg:grid-cols-6" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6")}>
      {children}
    </div>
  );
}

function MoviePoster({ movie, autoFocus, onOpen }: { movie: Pick<MovieItem, "id" | "title" | "poster" | "year" | "rating">; autoFocus?: boolean; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      onClick={onOpen}
      autoFocus={autoFocus}
      data-autofocus={autoFocus || undefined}
      className="group flex flex-col overflow-hidden rounded-xl bg-card text-left outline-none ring-offset-2 transition-transform focus-visible:ring-2 focus-visible:ring-ring hover:scale-[1.03]"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-900">
        {movie.poster && !failed ? (
          <img src={movie.poster} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-3 text-center text-muted-foreground/70">
            <Film className="h-8 w-8 shrink-0" />
            <span className="line-clamp-3 text-xs font-semibold text-white/80">{movie.title}</span>
          </div>
        )}
        {movie.rating && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
            <Star className="h-2.5 w-2.5 fill-current" /> {movie.rating}
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-medium leading-tight">{movie.title}</p>
        {movie.year && <p className="mt-0.5 text-[11px] text-muted-foreground">{movie.year}</p>}
      </div>
    </button>
  );
}
