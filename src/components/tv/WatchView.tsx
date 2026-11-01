"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportStream } from "@/lib/stream-health";
import { ChevronLeft, ExternalLink, Heart, ListVideo, Lock, Radio, Rss, SkipBack, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/tv/AdSlot";
import { Player } from "@/components/tv/Player";
import { GuideStrip } from "@/components/tv/GuideStrip";
import { ChannelCard } from "@/components/tv/ChannelCard";
import { ChannelRow } from "@/components/tv/ChannelRow";
import { StateView, describeError } from "@/components/tv/StateView";
import { fetchChannelById, fetchChannels, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAppStore, useIsTv } from "@/lib/store";
import { useSessionKey } from "@/lib/use-me";

export function WatchView({ channelId }: { channelId: string }) {
  const navigate = useAppStore((s) => s.navigate);
  const replace = useAppStore((s) => s.replace);
  const isFavorite = useAppStore((s) => s.favorites.includes(channelId));
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const addRecent = useAppStore((s) => s.addRecent);
  const watchContext = useAppStore((s) => s.watchContext);
  const isApp = useAppStore((s) => s.isNativeShell);
  const isTv = useIsTv();
  const [sourceIndex, setSourceIndex] = useState(0);
  // Switching channels: start fresh from the best source (derived-state reset during render).
  const [prevChannel, setPrevChannel] = useState(channelId);
  if (prevChannel !== channelId) {
    setPrevChannel(channelId);
    setSourceIndex(0);
  }
  // Sources we've already seen fail this session — auto-failover skips them, so we never
  // loop back onto a dead stream and never disturb a customer who's watching happily.
  // Keyed by channel so it resets itself when the channel changes (read only in handlers).
  const triedRef = useRef<{ key: string; set: Set<string> }>({ key: channelId, set: new Set() });
  const triedFor = useCallback((cid: string) => {
    if (triedRef.current.key !== cid) triedRef.current = { key: cid, set: new Set() };
    return triedRef.current.set;
  }, []);

  /** Back: return to the list this channel was opened from. */
  const back = useCallback(() => {
    if (!useAppStore.getState().goBack()) navigate({ name: "browse" });
  }, [navigate]);

  const session = useSessionKey();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["channel", session, channelId],
    queryFn: () => fetchChannelById(channelId),
    enabled: !!channelId && session !== null,
    retry: (failureCount, err) => (err instanceof ApiError && err.status === 403 ? false : failureCount < 1),
  });

  const locked = error instanceof ApiError && error.status === 403;
  const lockedReason = error instanceof ApiError ? error.message : "";
  const isGuestLock = error instanceof ApiError && error.data?.reason === "guest";

  const channel = data;

  // remember in recents
  useEffect(() => {
    if (channel) addRecent(channel.id);
  }, [channel?.id, addRecent]);

  // previous / next channel within the list the viewer came from
  const position = watchContext.indexOf(channelId);
  const previousId = position > 0 ? watchContext[position - 1] : null;
  const nextId = position >= 0 && position < watchContext.length - 1 ? watchContext[position + 1] : null;
  const goPrevious = useCallback(() => previousId && replace({ name: "watch", channelId: previousId }), [previousId, replace]);
  const goNext = useCallback(() => nextId && replace({ name: "watch", channelId: nextId }), [nextId, replace]);

  // TV remotes' channel keys (and PageUp / PageDown on keyboards) switch channel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ChannelUp" || e.key === "MediaTrackNext" || e.key === "PageUp") {
        if (!nextId) return;
        e.preventDefault();
        goNext();
      } else if (e.key === "ChannelDown" || e.key === "MediaTrackPrevious" || e.key === "PageDown") {
        if (!previousId) return;
        e.preventDefault();
        goPrevious();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextId, previousId, goNext, goPrevious]);

  const currentStream = channel?.streams[sourceIndex] ?? null;

  // failover: user-triggered jump to the next untried source
  const handleNextSource = () => {
    if (!channel) return;
    if (sourceIndex < channel.streams.length - 1) {
      toast.info("Switching to the next source…");
      setSourceIndex((i) => Math.min(i + 1, channel.streams.length - 1));
    }
  };

  // Automatic health-aware failover. When a source fails to play we report it (the
  // server disables that ONE source after repeated failures — never the channel) and
  // silently switch to the next source we haven't tried yet. The channel keeps playing;
  // the customer only sees a brief "Switching…" note, never an exit or an audio reset.
  const handleSourceError = useCallback(
    (streamId: string, err?: string) => {
      reportStream(streamId, false, err);
      if (!channel) return;
      const tried = triedFor(channel.id);
      tried.add(streamId);
      const nextIdx = channel.streams.findIndex((s) => !tried.has(s.id));
      if (nextIdx >= 0) {
        toast.info("Switching to backup source…");
        setSourceIndex(nextIdx);
      }
      // If every source has been tried, the player keeps its own error overlay
      // (Retry / Next channel) — we don't loop back onto a stream we know is dead.
    },
    [channel, triedFor]
  );

  const handleSourceOk = useCallback(
    (streamId: string) => {
      // A source that plays clears its failure streak and recovers if it had been disabled.
      if (channel) triedFor(channel.id).delete(streamId);
      reportStream(streamId, true);
    },
    [channel, triedFor]
  );

  // similar channels: same first category (fallback: same country)
  const similarQuery = useQuery({
    queryKey: ["similar", session, channel?.id, channel?.categories[0] ?? "", channel?.categories[0] ? "" : channel?.country ?? ""],
    queryFn: () =>
      fetchChannels({
        category: channel?.categories[0],
        country: channel?.categories[0] ? undefined : channel?.country ?? undefined,
        pageSize: 12,
      }),
    enabled: !!channel && (channel.categories.length > 0 || !!channel.country),
    retry: false,
  });

  const similar = useMemo(
    () => (similarQuery.data?.items ?? []).filter((c) => c.id !== channel?.id).slice(0, 12),
    [similarQuery.data, channel?.id]
  );
  const similarIds = useMemo(() => similar.map((c) => c.id), [similar]);

  // pending also covers "session still resolving" (query not started yet)
  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="mt-4 h-7 w-1/2" />
        <Skeleton className="mt-2 h-4 w-1/3" />
      </div>
    );
  }

  if (isError || !channel) {
    if (locked) {
      return (
        <StateView
          icon={Lock}
          tone="primary"
          title={isGuestLock ? "This channel needs a plan" : "This channel isn't in your plan"}
          message={lockedReason}
        >
          <Button className="rounded-full" data-autofocus onClick={() => navigate({ name: "premium" })}>
            View plans
          </Button>
          {isGuestLock && (
            <Button variant="outline" className="rounded-full" onClick={() => navigate({ name: "account" })}>
              Log in
            </Button>
          )}
          <Button variant="ghost" className="rounded-full" onClick={back}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </StateView>
      );
    }
    if (error && !(error instanceof ApiError && error.status === 404)) {
      const described = describeError(error, "This channel couldn't be loaded.");
      return (
        <StateView icon={described.icon} tone="error" title={described.title} message={described.message}>
          <Button className="rounded-full" data-autofocus onClick={() => refetch()}>
            Try again
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={back}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </StateView>
      );
    }
    return (
      <StateView icon={Radio} title="Channel not found" message="It may have been removed from the channel list.">
        <Button className="rounded-full" data-autofocus onClick={() => navigate({ name: "browse" })}>
          Browse channels
        </Button>
      </StateView>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      {/* Header row (mouse / touch; remotes use Back) */}
      {!isTv && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 rounded-full text-muted-foreground hover:text-foreground" onClick={back}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          {(previousId || nextId) && (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-full border-border/70"
                disabled={!previousId}
                onClick={goPrevious}
              >
                <SkipBack className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-full border-border/70" disabled={!nextId} onClick={goNext}>
                Next <SkipForward className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <div className={cn("grid gap-6", !isTv && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        {/* Left: player + info */}
        <div className="min-w-0">
          <Player
            stream={currentStream}
            title={channel.name}
            hasNextSource={sourceIndex < channel.streams.length - 1}
            onNextSource={handleNextSource}
            onPreviousChannel={previousId ? goPrevious : undefined}
            onNextChannel={nextId ? goNext : undefined}
            isFavorite={isFavorite}
            onToggleFavorite={() => toggleFavorite(channel.id)}
            onClosed={isTv ? back : undefined}
            onSourceError={handleSourceError}
            onSourceOk={handleSourceOk}
          />

          <GuideStrip channelId={channel.id} />

          {/* Channel info */}
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {channel.logo && (
                  <img
                    src={channel.logo}
                    alt=""
                    referrerPolicy="no-referrer"
                    className={cn("shrink-0 rounded-lg bg-zinc-900 object-contain p-1", isTv ? "h-12 w-12" : "h-9 w-9")}
                  />
                )}
                <h1 className={cn("truncate font-bold tracking-tight", isTv ? "text-3xl" : "text-xl")}>{channel.name}</h1>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {channel.countryFlag && channel.countryName && (
                  <Badge variant="secondary" className="rounded-full bg-muted/70 font-medium">
                    {channel.countryFlag} {channel.countryName}
                  </Badge>
                )}
                {channel.languages.map((lang) => (
                  <Badge key={lang} variant="secondary" className="rounded-full bg-muted/70 font-medium">
                    <Rss className="mr-1 h-3 w-3 text-muted-foreground" />
                    {lang}
                  </Badge>
                ))}
                {channel.categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      useAppStore.getState().setFilters({ collection: "all", category: cat });
                      navigate({ name: "browse" });
                    }}
                    className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className={cn("rounded-full border-border/70", isFavorite && "border-primary/50 text-primary")}
                onClick={() => toggleFavorite(channel.id)}
                aria-pressed={isFavorite}
              >
                <Heart className={cn("mr-1.5 h-4 w-4", isFavorite && "fill-current")} />
                {isFavorite ? "Saved" : "Save"}
              </Button>
              {channel.website && !isTv && !isApp && (
                <Button variant="outline" className="rounded-full border-border/70" asChild>
                  <a href={channel.website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-4 w-4" /> Website
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Alternate sources */}
          {channel.streams.length > 1 && (
            <section className="mt-6" aria-label="Alternate stream sources">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
                <ListVideo className="h-4 w-4 text-primary" />
                Alternate sources ({channel.streams.length})
              </h2>
              <div className="thin-scrollbar flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-xl border border-border/50 bg-card/40 p-3">
                {channel.streams.map((stream, idx) => (
                  <button
                    key={stream.id}
                    onClick={() => setSourceIndex(idx)}
                    aria-current={idx === sourceIndex}
                    data-selected={idx === sourceIndex || undefined}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      idx === sourceIndex
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    Source {idx + 1}
                    {stream.quality ? ` · ${stream.quality}` : ""}
                    {stream.title ? ` · ${stream.title}` : ""}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">If one source doesn&apos;t play, try another.</p>
            </section>
          )}

          <AdSlot slotId="watch-below-player" className="mt-6" />
        </div>

        {/* Right sidebar (desktop xl+): similar */}
        {!isTv && (
          <aside className="hidden min-w-0 xl:block" aria-label="Similar channels">
            <AdSlot slotId="watch-sidebar" compact />
            <h2 className="mb-3 mt-2 text-sm font-bold text-foreground">Similar channels</h2>
            <div className="grid grid-cols-2 gap-3">
              {similarQuery.isLoading
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-video rounded-lg" />)
                : similar.slice(0, 6).map((c) => <ChannelCard key={c.id} channel={c} contextIds={similarIds} focusKey={`similar-side-${c.id}`} />)}
            </div>
          </aside>
        )}
      </div>

      {/* Similar channels row (TV / < xl) */}
      <div className={cn("mt-4", !isTv && "xl:hidden")}>
        <ChannelRow
          id="similar"
          title="More like this"
          channels={similar}
          loading={similarQuery.isLoading}
          onSeeAll={
            channel.categories[0]
              ? () => {
                  useAppStore.getState().setFilters({ collection: "all", category: channel.categories[0] });
                  navigate({ name: "browse" });
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
