"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Film, Play, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Player } from "@/components/tv/Player";
import { StateView, describeError } from "@/components/tv/StateView";
import { fetchMovieById, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAppStore, useIsTv } from "@/lib/store";
import { useSessionKey } from "@/lib/use-me";
import type { StreamInfo } from "@/lib/types";

export function MovieView({ movieId }: { movieId: string }) {
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();
  const addRecentMovie = useAppStore((s) => s.addRecentMovie);
  const session = useSessionKey();
  const [playing, setPlaying] = useState(false);
  const [failedPosterId, setFailedPosterId] = useState<string | null>(null);

  const back = () => {
    if (!useAppStore.getState().goBack()) navigate({ name: "movies" });
  };

  const { data: movie, isPending, isError, error } = useQuery({
    queryKey: ["movie", session, movieId],
    queryFn: () => fetchMovieById(movieId),
    enabled: !!movieId && session !== null,
    retry: (n, e) => (e instanceof ApiError && e.status === 403 ? false : n < 1),
  });

  useEffect(() => {
    if (playing && movie) {
      addRecentMovie({ id: movie.id, title: movie.title, poster: movie.poster, year: movie.year, rating: movie.rating });
    }
  }, [addRecentMovie, movie, playing]);

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="mt-4 h-7 w-1/2" />
      </div>
    );
  }

  if (isError || !movie) {
    const described = describeError(error, "This movie couldn't be loaded.");
    return (
      <StateView icon={described.icon} tone="error" title={described.title} message={described.message}>
        <Button variant="ghost" className="rounded-full" onClick={back}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </StateView>
    );
  }

  const stream: StreamInfo | null = movie.playUrl
    ? { id: movie.id, title: movie.title, url: movie.playUrl, quality: null, referrer: null, userAgent: null }
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      {!isTv && (
        <Button variant="ghost" size="sm" className="mb-3 h-9 rounded-full text-muted-foreground hover:text-foreground" onClick={back}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      )}

      {playing && stream ? (
        <Player stream={stream} title={movie.title} onClosed={back} seekable />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="w-full max-w-[220px] shrink-0 overflow-hidden rounded-xl bg-zinc-900">
            {movie.poster && failedPosterId !== movieId ? (
              <img src={movie.poster} alt="" onError={() => setFailedPosterId(movieId)} className="aspect-[2/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-4 text-center text-muted-foreground/70">
                <Film className="h-10 w-10" />
                <span className="line-clamp-4 text-sm font-semibold text-white/80">{movie.title}</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={cn("font-bold tracking-tight", isTv ? "text-3xl" : "text-2xl")}>{movie.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {movie.year && <Badge variant="secondary" className="rounded-full bg-muted/70">{movie.year}</Badge>}
              {movie.rating && (
                <Badge variant="secondary" className="rounded-full bg-muted/70 text-amber-300">
                  <Star className="mr-1 h-3 w-3 fill-current" /> {movie.rating}
                </Badge>
              )}
              {movie.genre && <Badge variant="secondary" className="rounded-full bg-muted/70">{movie.genre}</Badge>}
            </div>
            {movie.plot && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{movie.plot}</p>}
            <Button
              className="mt-5 rounded-full"
              size="lg"
              data-autofocus
              disabled={!stream}
              onClick={() => setPlaying(true)}
            >
              <Play className="mr-1.5 h-5 w-5 fill-current" /> {stream ? "Play movie" : "Not available"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
