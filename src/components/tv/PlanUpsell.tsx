"use client";

import { Crown, LogIn, ShieldCheck, Tv, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

/**
 * Shared "need a plan" upsell — used by Home/Browse/Watch/Favorites when the
 * catalog is locked (guest or lapsed plan). Buttons route to Premium/Account.
 */
export function PlanUpsell({
  title = "Get a plan to unlock the full catalog",
  subtitle = "The whole live TV catalog is for plan members. Below are the free demo channels only.",
  compact = false,
}: {
  title?: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const navigate = useAppStore((s) => s.navigate);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8"
      aria-label="Plan upsell"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Crown className="h-5 w-5 text-primary" />
          </span>
          <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        </div>
        {!compact && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p>}

        <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
          <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
            <Tv className="h-4 w-4 shrink-0 text-primary" /> Thousands of live channels
          </li>
          <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
            <Zap className="h-4 w-4 shrink-0 text-primary" /> HD + every language
          </li>
          <li className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> TV, mobile, desktop
          </li>
        </ul>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button
            size="lg"
            className="h-11 rounded-full px-6 text-sm font-bold shadow-lg shadow-primary/25"
            onClick={() => navigate({ name: "premium" })}
          >
            <Crown className="mr-2 h-4 w-4" /> View plans
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full border-border/70 px-6 text-sm font-semibold"
            onClick={() => navigate({ name: "account" })}
          >
            <LogIn className="mr-2 h-4 w-4" /> Log in
          </Button>
        </div>
      </div>
    </section>
  );
}
