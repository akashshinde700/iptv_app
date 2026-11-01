"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsTv } from "@/lib/store";
import { fetchGuide, type GuideProgramme } from "@/lib/epg";

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function remaining(programme: GuideProgramme, now: number): string {
  const mins = Math.max(0, Math.round((programme.stop - now) / 60_000));
  if (mins < 1) return "ending now";
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m left`;
}

/**
 * "On now / Up next" from the operator's XMLTV guide.
 * Renders nothing at all when no source has an `epgUrl`, or the guide doesn't know this
 * channel — a missing guide should never look like a broken page.
 */
export function GuideStrip({ channelId }: { channelId: string }) {
  const isTv = useIsTv();
  const { data } = useQuery({
    queryKey: ["epg", channelId],
    queryFn: () => fetchGuide([channelId]),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const guide = data?.[0];
  if (!guide?.matched || (!guide.now && !guide.next)) return null;
  const now = Date.now();

  return (
    <div className={cn("rounded-xl border border-border/50 bg-card/40 p-3", isTv ? "mt-5" : "mt-4")}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" /> TV guide
      </div>

      {guide.now && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate font-semibold", isTv ? "text-lg" : "text-sm")}>{guide.now.title}</p>
            <span className="shrink-0 text-[11px] text-muted-foreground">{remaining(guide.now, now)}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(guide.now.progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {clock(guide.now.start)} – {clock(guide.now.stop)}
            {guide.now.description ? ` · ${guide.now.description.slice(0, 90)}` : ""}
          </p>
        </div>
      )}

      {guide.next && (
        <p className={cn("mt-2 truncate text-muted-foreground", isTv ? "text-base" : "text-xs")}>
          <span className="font-semibold text-foreground/80">Up next · {clock(guide.next.start)}</span> {guide.next.title}
        </p>
      )}
    </div>
  );
}
