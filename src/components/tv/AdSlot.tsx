"use client";

import { useEffect } from "react";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore, useIsTv } from "@/lib/store";
import { useMe } from "@/lib/use-me";

/**
 * Monetization-ready ad slot.
 *
 * - When NEXT_PUBLIC_ADSENSE_CLIENT is set (ca-pub-xxxx), renders a real
 *   Google AdSense unit with the given slot id. Push to adsbygoogle on mount.
 * - Until then, renders an in-house promo card that upsells Premium — so the
 *   layout is identical before/after AdSense approval.
 * - Hidden entirely for premium users.
 */
export function AdSlot({
  slotId,
  className,
  compact = false,
}: {
  slotId: string;
  className?: string;
  compact?: boolean;
}) {
  const premium = useAppStore((s) => s.premium);
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();
  const me = useMe();
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  // TV: promos are focus-trap noise for a remote. Plan members don't see upsells.
  const hidden = premium || isTv || (me.data?.access.hasAccess ?? false);

  useEffect(() => {
    if (hidden || !adsenseClient) return;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      // AdSense script not loaded yet — safe to ignore
    }
  }, [hidden, adsenseClient]);

  if (hidden) return null;

  if (adsenseClient) {
    return (
      <div className={cn("my-6 flex min-h-[90px] w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-card/40", className)}>
        {/* Google AdSense unit — requires the AdSense script tag in layout (see docs/MONETIZATION.md) */}
        <ins
          className="adsbygoogle block w-full"
          style={{ display: "block" }}
          data-ad-client={adsenseClient}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // House promo (used until AdSense is configured)
  return (
    <div
      className={cn(
        "my-6 w-full overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary/12 via-card/60 to-card/40",
        compact ? "p-3" : "p-4 sm:p-5",
        className
      )}
      role="complementary"
      aria-label="Promotion"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
          <Crown className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Unlock every channel with a plan</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plan members get the full live TV catalog on TV, phone and computer — without promotions.
          </p>
        </div>
        <Button size={compact ? "sm" : "default"} className="rounded-full shrink-0" onClick={() => navigate({ name: "premium" })}>
          View plans
        </Button>
      </div>
    </div>
  );
}
