"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Crown, MonitorSmartphone, ShieldCheck, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPlans } from "@/lib/api";
import type { PublicPlan } from "@/lib/types";
import { cn } from "@/lib/utils";

export function usePlans() {
  return useQuery({ queryKey: ["plans"], queryFn: fetchPlans, staleTime: 5 * 60 * 1000 });
}

export function formatPrice(price: number): string {
  return price === 0 ? "Free" : `₹${price.toLocaleString("en-IN")}`;
}

export function formatValidity(days: number): string {
  if (days >= 365 && days % 365 === 0) return days === 365 ? "1 year" : `${days / 365} years`;
  if (days >= 28 && days % 30 === 0) return days === 30 ? "1 month" : `${days / 30} months`;
  return days === 1 ? "1 day" : `${days} days`;
}

export interface PlanAction {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "outline";
}

/** One plan: name, price / validity, channels, devices — plus an optional CTA. */
export function PlanCard({
  plan,
  current = false,
  action,
  compact = false,
}: {
  plan: PublicPlan;
  current?: boolean;
  action?: PlanAction;
  compact?: boolean;
}) {
  return (
    <article
      aria-label={`${plan.name} plan${current ? " (current plan)" : ""}`}
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card/60",
        compact ? "p-4" : "p-5 sm:p-6",
        current ? "border-emerald-500/60" : "border-border/60"
      )}
    >
      {current && (
        <Badge className="absolute -top-2.5 right-4 rounded-full bg-emerald-600 px-2.5 text-[11px] font-bold text-white">
          Current plan
        </Badge>
      )}
      <div className="flex items-center gap-2">
        <Crown className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <h3 className={cn("font-bold", compact ? "text-base" : "text-lg")}>{plan.name}</h3>
      </div>
      <p className="mt-2">
        <span className={cn("font-extrabold tracking-tight", compact ? "text-2xl" : "text-3xl")}>{formatPrice(plan.price)}</span>
        {plan.price > 0 && <span className="text-sm text-muted-foreground"> / {formatValidity(plan.durationDays)}</span>}
      </p>
      {!compact && plan.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{plan.description}</p>}
      <ul className={cn("space-y-1.5 text-sm", compact ? "mt-2" : "mt-4")}>
        <li className="flex items-center gap-2">
          <Tv className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {plan.channelCount.toLocaleString("en-IN")} channels
        </li>
        <li className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          Valid for {formatValidity(plan.durationDays)}
        </li>
        <li className="flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          {plan.maxDevices} {plan.maxDevices === 1 ? "device" : "devices"} at a time
        </li>
        {!compact && (
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            {plan.allowAdult ? "Includes 18+ channels" : "Family-safe"}
          </li>
        )}
      </ul>
      {action && (
        <Button
          className={cn("w-full rounded-full font-semibold", compact ? "mt-3" : "mt-5")}
          variant={action.variant ?? "default"}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </article>
  );
}

export function PlansSkeleton({ count = 3, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-2xl", compact ? "h-40" : "h-64")} />
      ))}
    </>
  );
}

/**
 * Plans are activated on the account by the provider (no online checkout yet), so the
 * CTA explains exactly what to ask for instead of a fake payment.
 */
export function SubscribeDialog({
  plan,
  verb,
  onOpenChange,
}: {
  plan: PublicPlan | null;
  verb: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={plan !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {plan && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Crown className="h-5 w-5 text-primary" aria-hidden />
                {verb} {plan.name}
              </DialogTitle>
              <DialogDescription className="text-base">
                Your provider activates plans on your account. Ask them for the <b className="text-foreground">{plan.name}</b>{" "}
                plan ({formatPrice(plan.price)} / {formatValidity(plan.durationDays)}). As soon as it&apos;s active it shows
                up here on every device — no reinstall needed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="rounded-full" autoFocus onClick={() => onOpenChange(false)}>
                OK
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
