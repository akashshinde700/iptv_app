"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChannelCard } from "@/components/tv/ChannelCard";
import { useIsTv } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ChannelItem } from "@/lib/types";

/**
 * Horizontally scrolling row of channel cards with a title + "See all" action.
 * The scroller is a nav group, so coming back up/down into it on a remote lands on
 * the card last focused there.
 */
export function ChannelRow({
  id,
  title,
  channels,
  loading,
  onSeeAll,
  seeAllLabel = "See all",
  autoFocusFirst = false,
}: {
  id: string;
  title: string;
  channels: ChannelItem[];
  loading?: boolean;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  autoFocusFirst?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isTv = useIsTv();
  const ids = useMemo(() => channels.map((c) => c.id), [channels]);

  const scrollBy = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * scrollerRef.current.clientWidth * 0.8, behavior: "smooth" });
  };

  if (!loading && channels.length === 0) return null;

  const itemClass = isTv ? "w-[12.5rem] shrink-0" : "w-[46%] shrink-0 snap-start sm:w-[11.25rem]";

  return (
    <section className={isTv ? "mt-8" : "mt-7"} aria-label={title}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className={cn("font-bold tracking-tight text-foreground", isTv ? "text-2xl" : "text-base sm:text-lg")}>
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {onSeeAll && !loading && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("rounded-full text-muted-foreground hover:text-foreground", isTv ? "h-10 text-base" : "h-8 text-xs")}
              onClick={onSeeAll}
            >
              {seeAllLabel}
            </Button>
          )}
          {!isTv && (
            <div className="hidden items-center gap-1 sm:flex">
              <Button
                variant="outline"
                size="icon"
                tabIndex={-1}
                className="h-7 w-7 rounded-full border-border/60"
                onClick={() => scrollBy(-1)}
                aria-label={`Scroll ${title} left`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                tabIndex={-1}
                className="h-7 w-7 rounded-full border-border/60"
                onClick={() => scrollBy(1)}
                aria-label={`Scroll ${title} right`}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollerRef}
        data-nav-group={`row-${id}`}
        className={cn(
          "no-scrollbar flex overflow-x-auto",
          isTv ? "-mx-3 gap-5 px-3 py-3" : "-mx-1 snap-x snap-proximity gap-3 px-1 py-1"
        )}
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={itemClass}>
                <Skeleton className="aspect-video w-full rounded-lg" />
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-1 h-3 w-1/2" />
              </div>
            ))
          : channels.map((channel, i) => (
              <div key={channel.id} className={itemClass}>
                <ChannelCard
                  channel={channel}
                  contextIds={ids}
                  focusKey={`${id}-ch-${channel.id}`}
                  autoFocus={autoFocusFirst && i === 0}
                />
              </div>
            ))}
      </div>
    </section>
  );
}
