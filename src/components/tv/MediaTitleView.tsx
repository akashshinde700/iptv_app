"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Film, Loader2, Play, Star, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Player } from "@/components/tv/Player";
import { PlanUpsell } from "@/components/tv/PlanUpsell";
import { StateView, describeError } from "@/components/tv/StateView";
import { ApiError } from "@/lib/api";
import { fetchMediaSources, fetchMediaTitle, type MediaEpisode, type MediaSources } from "@/lib/media";
import { cn } from "@/lib/utils";
import { useAppStore, useIsTv } from "@/lib/store";
import { useSessionKey } from "@/lib/use-me";

function formatDuration(seconds: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** "Resume from 12:34" style label. */
function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One title page for both movies and series (provider-agnostic).
 *
 * Movies: poster + meta + "Play" (the API hands back a signed, opaque proxy URL).
 * Series: season picker + episode list; the first episode is the default action, and the
 * resume position is stored per episode id so "Continue S2E4" survives a reload.
 */
export function MediaTitleView({ id }: { id: string }) {
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();
  const session = useSessionKey();
  const saveProgress = useAppStore((s) => s.saveProgress);
  const progress = useAppStore((s) => s.progress);
  const addRecentMovie = useAppStore((s) => s.addRecentMovie);

  const [season, setSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState<MediaEpisode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [sources, setSources] = useState<MediaSources | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["media-title", session, id, season],
    queryFn: () => fetchMediaTitle(id, season),
    enabled: session !== null,
    retry: (n, e) => (e instanceof ApiError && e.status === 403 ? false : n < 1),
  });

  const back = () => {
    if (!useAppStore.getState().goBack()) navigate({ name: "movies" });
  };

  const title = detail.data;
  const isSeries = title?.kind === "series";
  const episode = selectedEpisode;

  // resume key: movies keyed by the title id, series keyed per episode
  const playbackKey = episode ? `${id}:S${episode.season}E${episode.episode}` : id;
  const resumeAt = progress[playbackKey]?.seconds ?? 0;

  const seasons = title?.seasons ?? [];

  const startPlayback = async (target: { episode?: MediaEpisode } = {}) => {
    if (!title) return;
    const ep = target.episode ?? (isSeries ? seasons[0]?.episodes[0] : undefined);
    setLoadingSources(true);
    setSourceError(null);
    setSources(null);
    setPlaying(true);
    try {
      const payload = await fetchMediaSources(id, ep ? { season: ep.season, episode: ep.episode } : {});
      if (!payload.sources.length) throw new Error("No playable source");
      setSelectedEpisode(ep ?? null);
      setSources(payload);
      setSourceIndex(0);
      if (!isSeries) {
        addRecentMovie({
          id: title.id,
          title: title.title,
          poster: title.poster,
          year: title.year,
          rating: title.rating,
        });
      }
    } catch (error) {
      setPlaying(false);
      setSourceError(error instanceof Error ? error.message : "This title can't be played right now.");
    } finally {
      setLoadingSources(false);
    }
  };

  if (detail.isPending) {
    return (
      <div className="mx-auto max-w-5xl">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="mt-4 h-8 w-1/2" />
      </div>
    );
  }

  if (detail.isError && detail.error instanceof ApiError && detail.error.status === 403) {
    return <PlanUpsell title="This title needs a plan" subtitle="Movies and shows are part of every active plan." />;
  }

  if (detail.isError || !title) {
    const described = describeError(detail.error, "This title couldn't be loaded.");
    return (
      <StateView icon={described.icon} tone="error" title={described.title} message={described.message}>
        <Button variant="ghost" className="rounded-full" onClick={back}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </StateView>
    );
  }

  const currentSource = sources?.sources[sourceIndex] ?? null;
  // Third-party embeds are documents, not streams: they go in an iframe, never into <video>.
  // Only an absolute https URL is accepted, so a tampered API response cannot load a
  // `javascript:` or `data:` document.
  const embedUrl =
    currentSource?.embed && /^https:\/\//.test(currentSource.url) ? currentSource.url : null;
  const stream = currentSource && !currentSource.embed
    ? {
        id: currentSource.id,
        title: sources?.title ?? title.title,
        url: currentSource.url,
        quality: currentSource.quality,
        referrer: null,
        userAgent: null,
      }
    : null;

  if (playing) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => {
              setPlaying(false);
              setSources(null);
            }}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back to {isSeries ? "episodes" : "details"}
          </Button>
          {sources && sources.sources.length > 1 && (
            <Select value={String(sourceIndex)} onValueChange={(v) => setSourceIndex(Number(v))}>
              <SelectTrigger className="h-9 w-[12rem] rounded-full" aria-label="Source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sources.sources.map((source, index) => (
                  <SelectItem key={source.id} value={String(index)}>
                    {source.server} · {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {loadingSources && (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-black">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-zinc-300">Finding the best source…</p>
          </div>
        )}

        {!loadingSources && sourceError && (
          <StateView icon={Film} tone="error" title="Couldn't start playback" message={sourceError}>
            <Button className="rounded-full" onClick={() => startPlayback({ episode: episode ?? undefined })}>
              Try again
            </Button>
          </StateView>
        )}

        {!loadingSources && embedUrl && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
              <iframe
                src={embedUrl}
                title={currentSource?.server ? `${currentSource.server} player` : "Embedded player"}
                className="aspect-video w-full"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              No direct source worked for this title, so it is playing from {currentSource?.server ?? "a backup player"} —
              a third-party website. If it does not start, pick another player above.
            </p>
          </div>
        )}

        {!loadingSources && stream && (
          <>
            <Player
              stream={stream}
              title={sources?.title ?? title.title}
              seekable
              startAt={resumeAt}
              subtitles={currentSource?.subtitles}
              onProgress={(seconds, duration) => saveProgress(playbackKey, seconds, duration)}
              onClosed={() => {
                setPlaying(false);
                setSources(null);
              }}
              onSourceError={(_, message) => {
                // health-aware failover: hop to the next server instead of dead-ending
                if (sources && sourceIndex < sources.sources.length - 1) {
                  setSourceIndex((i) => i + 1);
                } else {
                  setSourceError(message ?? "Every source for this title failed.");
                }
              }}
            />
            {isSeries && seasons.length > 0 && (
              <EpisodeStrip
                seasons={seasons}
                season={episode?.season ?? season}
                activeEpisode={episode?.episode ?? null}
                onPick={(ep) => {
                  setSources(null);
                  setPlaying(false);
                  startPlayback({ episode: ep });
                }}
              />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {!isTv && (
        <Button variant="ghost" size="sm" className="mb-3 h-9 rounded-full text-muted-foreground hover:text-foreground" onClick={back}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      )}

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-full max-w-[220px] shrink-0 overflow-hidden rounded-xl bg-zinc-900">
          {title.poster ? (
            <img src={title.poster} alt="" className="aspect-[2/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black p-4 text-center">
              {isSeries ? <Tv className="h-10 w-10 text-muted-foreground/70" /> : <Film className="h-10 w-10 text-muted-foreground/70" />}
              <span className="line-clamp-4 text-sm font-semibold text-white/80">{title.title}</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className={cn("font-bold tracking-tight", isTv ? "text-3xl" : "text-2xl")}>{title.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {title.year && <Badge variant="secondary" className="rounded-full bg-muted/70">{title.year}</Badge>}
            {title.rating && (
              <Badge variant="secondary" className="rounded-full bg-muted/70 text-amber-300">
                <Star className="mr-1 h-3 w-3 fill-current" /> {title.rating}
              </Badge>
            )}
            <Badge variant="secondary" className="rounded-full bg-muted/70">{isSeries ? "TV Show" : "Movie"}</Badge>
            {title.genres.slice(0, 3).map((genre) => (
              <Badge key={genre} variant="secondary" className="rounded-full bg-muted/70">{genre}</Badge>
            ))}
          </div>
          {title.plot && <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{title.plot}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {isSeries ? (
              <Select
                value={String(season)}
                onValueChange={(v) => setSeason(Number(v))}
                disabled={seasons.length <= 1}
              >
                <SelectTrigger className={cn("rounded-full", isTv ? "h-12 w-44 text-base" : "h-10 w-40")} aria-label="Season">
                  <SelectValue placeholder="Season 1" />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map((s) => (
                    <SelectItem key={s.season} value={String(s.season)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Button
              className="rounded-full"
              size={isTv ? "lg" : "default"}
              data-autofocus
              disabled={loadingSources || (isSeries && !seasons.length)}
              onClick={() => startPlayback()}
            >
              {loadingSources ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4 fill-current" />}
              {isSeries
                ? seasons.length
                  ? `Play S${seasons[0]?.season ?? 1}E1`
                  : "Episodes unavailable"
                : resumeAt > 5
                  ? `Resume ${formatClock(resumeAt)}`
                  : "Play movie"}
            </Button>

            {resumeAt > 5 && (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  const key = playbackKey;
                  useAppStore.getState().clearProgress(key);
                  startPlayback();
                }}
              >
                Start over
              </Button>
            )}
          </div>
          {sourceError && <p className="mt-3 text-sm text-destructive">{sourceError}</p>}
        </div>
      </div>

      {isSeries && seasons.length > 0 && (
        <section className="mt-8" aria-label="Episodes">
          <h2 className={cn("mb-3 font-bold tracking-tight", isTv ? "text-2xl" : "text-lg")}>Episodes</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {seasons
              .find((s) => s.season === season)
              ?.episodes.map((ep, index) => {
                const epKey = `${id}:S${ep.season}E${ep.episode}`;
                const resume = progress[epKey]?.seconds ?? 0;
                return (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => startPlayback({ episode: ep })}
                    data-focus-key={`ep-${ep.season}-${ep.episode}`}
                    data-autofocus={index === 0 || undefined}
                    className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5 text-left outline-none transition hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                      {ep.still ? (
                        <img src={ep.still} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                          <Play className="h-4 w-4" />
                        </div>
                      )}
                      {resume > 5 && (
                        <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-primary">
                          {formatClock(resume)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {ep.episode}. {ep.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {ep.plot ?? formatDuration(ep.durationSecs) ?? "No description"}
                      </p>
                    </div>
                  </button>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}

/** Compact "up next" strip shown under the player while watching a series. */
function EpisodeStrip({
  seasons,
  season,
  activeEpisode,
  onPick,
}: {
  seasons: { season: number; name: string; episodes: MediaEpisode[] }[];
  season: number;
  activeEpisode: number | null;
  onPick: (episode: MediaEpisode) => void;
}) {
  const episodes = useMemo(
    () => seasons.find((s) => s.season === season)?.episodes ?? [],
    [seasons, season],
  );
  if (episodes.length === 0) return null;

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {episodes.map((ep) => (
        <button
          key={ep.id}
          type="button"
          onClick={() => onPick(ep)}
          data-focus-key={`player-ep-${ep.season}-${ep.episode}`}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
            ep.episode === activeEpisode
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground",
          )}
        >
          E{ep.episode} · {ep.title.length > 28 ? `${ep.title.slice(0, 28)}…` : ep.title}
        </button>
      ))}
    </div>
  );
}
