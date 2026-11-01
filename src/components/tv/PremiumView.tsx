"use client";

import { useState } from "react";
import { CalendarClock, Crown, LogIn, MonitorSmartphone, ShieldAlert, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/components/admin/shared";
import { PlanCard, PlansSkeleton, SubscribeDialog, usePlans, type PlanAction } from "@/components/tv/Plans";
import { StateView, describeError } from "@/components/tv/StateView";
import { useMe } from "@/lib/use-me";
import { useAppStore, useIsTv } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/lib/types";

/**
 * Subscription: the customer's current plan (status, expiry, devices) and the plans the
 * provider publishes (GET /api/plans). Plans are activated by the provider, so the CTAs
 * explain how to subscribe / renew / upgrade — access itself is always decided server-side.
 */
export function PremiumView() {
  const me = useMe();
  const plans = usePlans();
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();
  const [dialog, setDialog] = useState<{ plan: PublicPlan; verb: string } | null>(null);

  const customer = me.data?.customer ?? null;
  const hasAccess = me.data?.access.hasAccess ?? false;
  const currentPlanId = customer?.plan?.id ?? null;
  const currentPlan = plans.data?.find((p) => p.id === currentPlanId) ?? null;
  const currentPrice = currentPlan?.price ?? customer?.plan?.price ?? 0;

  const actionFor = (plan: PublicPlan): PlanAction => {
    if (!customer) return { label: "Log in to subscribe", variant: "outline", onClick: () => navigate({ name: "account" }) };
    if (plan.id === currentPlanId) {
      return hasAccess
        ? { label: "Your current plan", variant: "outline", disabled: true }
        : { label: "Renew", onClick: () => setDialog({ plan, verb: "Renew" }) };
    }
    return plan.price > currentPrice
      ? { label: "Upgrade", onClick: () => setDialog({ plan, verb: "Upgrade to" }) }
      : { label: "Choose plan", variant: "outline", onClick: () => setDialog({ plan, verb: "Switch to" }) };
  };

  const expiresAt = customer?.planExpiresAt ? new Date(customer.planExpiresAt) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
  const statusLabel = !customer ? null : hasAccess ? "Active" : customer.status === "ACTIVE" ? "Not active" : customer.status.toLowerCase();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={cn("font-extrabold tracking-tight", isTv ? "text-4xl" : "text-2xl sm:text-3xl")}>Subscription</h1>
      <p className={cn("mt-1 text-muted-foreground", isTv ? "text-lg" : "text-sm")}>Your plan and the plans you can switch to.</p>

      {/* Current plan */}
      <section aria-label="Your plan" className="mt-6">
        {me.isLoading ? (
          <Skeleton className="h-36 w-full rounded-3xl" />
        ) : !customer ? (
          <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-primary/25 bg-primary/5 p-6">
            <LogIn className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={cn("font-bold", isTv ? "text-2xl" : "text-lg")}>Log in to see your plan</p>
              <p className="text-sm text-muted-foreground">Already subscribed with your provider? Log in and every channel in your plan unlocks.</p>
            </div>
            <Button size="lg" className="rounded-full" data-autofocus onClick={() => navigate({ name: "account" })}>
              <LogIn className="mr-2 h-4 w-4" /> Log in
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-3xl border p-6",
              hasAccess ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Crown className={cn("h-7 w-7", hasAccess ? "text-emerald-400" : "text-amber-400")} aria-hidden />
              <p className={cn("font-bold", isTv ? "text-3xl" : "text-xl")}>{customer.plan?.name ?? "No plan assigned"}</p>
              {statusLabel && (
                <Badge
                  variant="outline"
                  className={cn(
                    "capitalize",
                    hasAccess ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"
                  )}
                >
                  {statusLabel}
                </Badge>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                {hasAccess ? (
                  <Button className="rounded-full" data-autofocus onClick={() => navigate({ name: "browse" })}>
                    <Tv className="mr-1.5 h-4 w-4" /> Watch channels
                  </Button>
                ) : (
                  <Button
                    className="rounded-full"
                    data-autofocus
                    onClick={() => (currentPlan ? setDialog({ plan: currentPlan, verb: "Renew" }) : document.getElementById("available-plans")?.scrollIntoView({ behavior: "smooth" }))}
                  >
                    <Crown className="mr-1.5 h-4 w-4" /> {currentPlan ? "Renew" : "Choose a plan"}
                  </Button>
                )}
              </div>
            </div>
            {hasAccess && daysLeft !== null && daysLeft <= 7 && (
              <p role="status" className="mt-3 font-semibold text-amber-300">
                {daysLeft <= 0 ? "Your plan expires today." : `Your plan expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}.`}
              </p>
            )}
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
                <dt className="text-muted-foreground">Expiry:</dt>
                <dd className={cn("font-medium", customer.expired && "text-red-400")}>
                  {expiresAt ? fmtDate(customer.planExpiresAt) : "—"}
                  {daysLeft !== null && (daysLeft >= 0 ? ` (${daysLeft} days left)` : " (expired)")}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4 text-primary" aria-hidden />
                <dt className="text-muted-foreground">Devices:</dt>
                <dd className="font-medium">{customer.plan ? customer.plan.maxDevices : "—"}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Tv className="h-4 w-4 text-primary" aria-hidden />
                <dt className="text-muted-foreground">Channels:</dt>
                <dd className="font-medium">{currentPlan ? currentPlan.channelCount.toLocaleString("en-IN") : "—"}</dd>
              </div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" aria-hidden />
                <dt className="text-muted-foreground">Adult content:</dt>
                <dd className="font-medium">{customer.plan ? (customer.plan.allowAdult ? "Allowed" : "Blocked") : "—"}</dd>
              </div>
            </dl>
          </div>
        )}
      </section>

      {/* Available plans */}
      <section id="available-plans" aria-labelledby="plans-title" className="mt-10 scroll-mt-6">
        <h2 id="plans-title" className={cn("font-bold tracking-tight", isTv ? "text-3xl" : "text-xl")}>
          Available plans
        </h2>
        {plans.isError ? (
          (() => {
            const described = describeError(plans.error, "Plans couldn't be loaded.");
            return (
              <StateView compact icon={described.icon} tone="error" title={described.title} message={described.message}>
                <Button className="rounded-full" onClick={() => plans.refetch()}>
                  Try again
                </Button>
              </StateView>
            );
          })()
        ) : !plans.isLoading && (plans.data ?? []).length === 0 ? (
          <StateView compact icon={Crown} title="No plans available right now" message="Your provider hasn't published any plans yet." />
        ) : (
          <div className={cn("mt-4 grid gap-4", isTv ? "grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3")} data-nav-group="plans">
            {plans.isLoading ? (
              <PlansSkeleton count={3} />
            ) : (
              (plans.data ?? []).map((plan) => (
                <PlanCard key={plan.id} plan={plan} current={plan.id === currentPlanId} action={actionFor(plan)} />
              ))
            )}
          </div>
        )}
        <p className="mt-6 text-sm text-muted-foreground">
          Plans are activated on your account by your provider, and payment happens with them. StreamKaro never asks for
          card details inside the app.
        </p>
      </section>

      <SubscribeDialog plan={dialog?.plan ?? null} verb={dialog?.verb ?? ""} onOpenChange={(open) => !open && setDialog(null)} />
    </div>
  );
}
