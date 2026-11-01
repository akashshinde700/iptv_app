"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Heart, History, Trash2, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelCard, channelGridClass } from "@/components/tv/ChannelCard";
import { AdSlot } from "@/components/tv/AdSlot";
import { StateView, describeError } from "@/components/tv/StateView";
import { fetchChannelsByIds } from "@/lib/api";
import { useMe, useSessionKey } from "@/lib/use-me";
import { useAppStore, useIsTv } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ChannelItem } from "@/lib/types";

/** Grid of channels saved on this device (favorites or watch history), in saved order. */
function SavedChannels({
  kind,
  ids,
  title,
  subtitle,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  action,
}: {
  kind: "favorites" | "history";
  ids: string[];
  title: string;
  subtitle: string;
  emptyIcon: typeof Heart;
  emptyTitle: string;
  emptyMessage: string;
  action?: React.ReactNode;
}) {
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();
  const me = useMe();
  const isGuest = !me.isLoading && me.data?.customer == null;
  const session = useSessionKey();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [kind, session, ids.join(",")],
    queryFn: () => fetchChannelsByIds(ids),
    enabled: session !== null && ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const channels = useMemo(() => {
    const map = new Map((data ?? []).map((c) => [c.id, c]));
    return ids.map((id) => map.get(id)).filter((c): c is ChannelItem => !!c);
  }, [data, ids]);
  const contextIds = useMemo(() => channels.map((c) => c.id), [channels]);

  if (ids.length === 0) {
    return (
      <StateView icon={emptyIcon} tone="primary" title={emptyTitle} message={emptyMessage}>
        <Button className="rounded-full" data-autofocus onClick={() => navigate({ name: "browse" })}>
          <Tv className="mr-2 h-4 w-4" /> Browse channels
        </Button>
      </StateView>
    );
  }

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={cn("font-bold tracking-tight", isTv ? "text-3xl" : "text-xl sm:text-2xl")}>{title}</h1>
        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">{ids.length}</span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <p className={cn("mt-0.5 text-muted-foreground", isTv ? "text-base" : "text-sm")}>{subtitle}</p>

      {isGuest && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <Crown className="h-4 w-4 shrink-0 text-primary" />
          <span>Without a plan, only demo channels will load. Log in or get a plan to unlock the full catalog.</span>
          <Button size="sm" variant="outline" className="ml-auto h-8 rounded-full" onClick={() => navigate({ name: "premium" })}>
            View plans
          </Button>
        </div>
      )}

      <div className="mt-5">
        {isLoading || session === null ? (
          <div className={channelGridClass(isTv)} aria-hidden>
            {Array.from({ length: Math.min(ids.length, 12) }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : isError ? (
          (() => {
            const described = describeError(error);
            return (
              <StateView icon={described.icon} tone="error" title={described.title} message={described.message}>
                <Button className="rounded-full" onClick={() => refetch()}>
                  Try again
                </Button>
              </StateView>
            );
          })()
        ) : channels.length === 0 ? (
          <StateView
            icon={emptyIcon}
            title="These channels aren't available right now"
            message="They may have left your plan or gone offline."
          />
        ) : (
          <div className={channelGridClass(isTv)}>
            {channels.map((channel, i) => (
              <ChannelCard key={channel.id} channel={channel} contextIds={contextIds} autoFocus={i === 0} />
            ))}
          </div>
        )}
      </div>

      <AdSlot slotId={`${kind}-footer`} />
    </div>
  );
}

export function FavoritesView() {
  const favorites = useAppStore((s) => s.favorites);
  return (
    <SavedChannels
      kind="favorites"
      ids={favorites}
      title="Your favorites"
      subtitle="Saved on this device."
      emptyIcon={Heart}
      emptyTitle="No favorites yet"
      emptyMessage="Open a channel and choose “Save” to keep it here for quick access."
    />
  );
}

export function HistoryView() {
  const recents = useAppStore((s) => s.recents);
  const clearRecents = useAppStore((s) => s.clearRecents);
  return (
    <SavedChannels
      kind="history"
      ids={recents}
      title="Recently watched"
      subtitle="The last channels you opened on this device."
      emptyIcon={History}
      emptyTitle="Nothing watched yet"
      emptyMessage="Channels you watch will show up here."
      action={
        <Button variant="ghost" className="rounded-full text-muted-foreground hover:text-foreground" onClick={clearRecents}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Clear history
        </Button>
      }
    />
  );
}
