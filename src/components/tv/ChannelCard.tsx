"use client";

import { memo, useState } from "react";
import { Heart, Play, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppStore, useIsTv } from "@/lib/store";
import type { ChannelItem } from "@/lib/types";

function categoryLabel(slug: string | undefined): string | null {
  if (!slug) return null;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Grid classes shared by every channel list. TV uses rem-based auto-fill so the
 * cards grow with the 10-foot root font size instead of fixed column counts.
 */
export function channelGridClass(isTv: boolean): string {
  return isTv
    ? "grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-5"
    : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";
}

/**
 * Channel tile used in grids and horizontal rows.
 * - One focus stop per card on TV / Windows (the heart becomes a status badge there).
 * - `data-focus-key` lets Back return focus to this exact card.
 * - `contextIds` is the list it was opened from (previous / next channel in the player).
 */
export const ChannelCard = memo(function ChannelCard({
  channel,
  className,
  contextIds,
  focusKey,
  autoFocus = false,
}: {
  channel: ChannelItem;
  className?: string;
  contextIds?: string[];
  focusKey?: string;
  autoFocus?: boolean;
}) {
  const isFavorite = useAppStore((s) => s.favorites.includes(channel.id));
  const keyboardFirst = useAppStore((s) => s.isElectron);
  const isTv = useIsTv();
  const [logoFailed, setLogoFailed] = useState(false);
  const category = categoryLabel(channel.categories[0]);

  const open = () => {
    const { setWatchContext, navigate } = useAppStore.getState();
    setWatchContext(contextIds && contextIds.length > 0 ? contextIds : [channel.id]);
    navigate({ name: "watch", channelId: channel.id });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-card
      data-focus-key={focusKey ?? `ch-${channel.id}`}
      data-autofocus={autoFocus || undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`Watch ${channel.name}${category ? `, ${category}` : ""}${isFavorite ? ", in favorites" : ""}`}
      className={cn(
        "group relative cursor-pointer rounded-xl border border-border/50 bg-card/60 p-2.5 text-left outline-none transition-all duration-200",
        "hover:border-primary/40 hover:bg-card hover:shadow-[0_0_0_1px_oklch(0.769_0.188_70.08/0.25),0_8px_24px_-12px_rgba(0,0,0,0.8)]",
        "focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {/* Logo area */}
      <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-lg bg-zinc-900">
        {channel.logo && !logoFailed ? (
          <img
            src={channel.logo}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setLogoFailed(true)}
            className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            <Tv className="h-8 w-8 text-muted-foreground/60" aria-hidden />
          </div>
        )}

        {/* play overlay: hover (mouse) / focus (remote, keyboard) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </div>

        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
          LIVE
        </span>
        {channel.bestStream?.quality && (
          <Badge className="absolute bottom-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0 text-[10px] font-bold text-amber-300 backdrop-blur">
            {channel.bestStream.quality}
          </Badge>
        )}
        {channel.streamCount > 1 && (
          <Badge
            variant="secondary"
            className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0 text-[10px] font-semibold text-zinc-200 backdrop-blur"
          >
            {channel.streamCount} sources
          </Badge>
        )}

        {isTv ? (
          isFavorite && (
            <span
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/90 text-primary-foreground"
              aria-hidden
            >
              <Heart className="h-4 w-4 fill-current" />
            </span>
          )
        ) : (
          <button
            tabIndex={keyboardFirst ? -1 : 0}
            onClick={(e) => {
              e.stopPropagation();
              useAppStore.getState().toggleFavorite(channel.id);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={isFavorite ? `Remove ${channel.name} from favorites` : `Add ${channel.name} to favorites`}
            aria-pressed={isFavorite}
            className={cn(
              "absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isFavorite
                ? "bg-primary/90 text-primary-foreground opacity-100"
                : "bg-black/60 text-white opacity-0 hover:bg-black/80 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-90"
            )}
          >
            <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </button>
        )}
      </div>

      {/* Meta */}
      <p className="truncate text-sm font-semibold leading-5 text-foreground">{channel.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {channel.countryFlag ? `${channel.countryFlag} ` : ""}
        {channel.countryName ?? "International"}
        {category ? ` · ${category}` : channel.languages.length > 0 ? ` · ${channel.languages[0]}` : ""}
      </p>
    </div>
  );
});
