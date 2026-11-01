"use client";

import { useState } from "react";
import {
  AlarmClock,
  Building2,
  CalendarX2,
  CircleSlash,
  Clock3,
  IndianRupee,
  PauseCircle,
  Tv,
  UserCheck,
  UserPlus,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlatformStats } from "./api";
import { AuditTable } from "./Audit";
import { AddCustomerDialog } from "./Customers";
import { useRoute, type Section } from "./router";
import { money, PageHeader, Panel } from "./ui";

interface Card {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad";
  to: { section: Section; query?: Record<string, string> };
}

export function DashboardSection({ stats }: { stats: PlatformStats | undefined }) {
  const { go } = useRoute();
  const [addOpen, setAddOpen] = useState(false);

  const cards: Card[] = stats
    ? [
        { label: "Organizations", value: stats.orgs.total, sub: `${stats.orgs.active} active · ${stats.orgs.suspended} suspended`, icon: Building2, to: { section: "organizations" } },
        { label: "Customers", value: stats.customers.total, sub: `${stats.subscribers.none} without a subscription`, icon: Users, to: { section: "customers" } },
        { label: "Active subscribers", value: stats.subscribers.active, sub: "can watch right now", icon: UserCheck, tone: "good", to: { section: "customers", query: { state: "ACTIVE" } } },
        { label: "Expiring in 7 days", value: stats.subscribers.expiring7, sub: `${stats.subscribers.expiring3} within 3 days`, icon: AlarmClock, tone: stats.subscribers.expiring7 > 0 ? "warn" : "default", to: { section: "subscriptions", query: { state: "EXPIRING" } } },
        { label: "Expired", value: stats.subscribers.expired, sub: "need renewal", icon: CalendarX2, tone: stats.subscribers.expired > 0 ? "bad" : "default", to: { section: "customers", query: { state: "EXPIRED" } } },
        { label: "Suspended", value: stats.subscribers.suspended, sub: "accounts or subscriptions", icon: PauseCircle, to: { section: "customers", query: { state: "SUSPENDED" } } },
        { label: "Pending activation", value: stats.subscribers.pending, sub: "waiting for payment", icon: Clock3, to: { section: "customers", query: { state: "PENDING" } } },
        { label: "Payments pending", value: stats.payments.pending, sub: "subscriptions not fully paid", icon: WalletCards, tone: stats.payments.pending > 0 ? "warn" : "default", to: { section: "subscriptions", query: { state: "PAYMENT_PENDING" } } },
        { label: "Revenue (30 days)", value: money(stats.payments.revenue30d), sub: `${money(stats.payments.revenueTotal)} all time`, icon: IndianRupee, tone: "good", to: { section: "payments", query: { status: "PAID" } } },
        { label: "Channels", value: stats.channels.toLocaleString("en-IN"), sub: `${stats.portals} portals`, icon: Tv, to: { section: "organizations" } },
        { label: "No subscription", value: stats.subscribers.none, sub: "customers who can't watch paid channels", icon: CircleSlash, to: { section: "customers", query: { state: "NO_SUBSCRIPTION" } } },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Click any card to open the matching list."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Add customer
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => go(c.to.section, { query: c.to.query })}
            className={cn(
              "group rounded-xl border bg-zinc-900/40 p-4 text-left transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
              c.tone === "warn" ? "border-amber-500/30" : c.tone === "bad" ? "border-red-500/30" : c.tone === "good" ? "border-emerald-500/25" : "border-zinc-800"
            )}
          >
            <div className="flex items-center justify-between text-xs text-zinc-400">
              {c.label}
              <c.icon
                className={cn("h-4 w-4", c.tone === "warn" ? "text-amber-400" : c.tone === "bad" ? "text-red-400" : c.tone === "good" ? "text-emerald-400" : "text-zinc-500")}
                aria-hidden
              />
            </div>
            <div className="mt-1 text-2xl font-bold text-white">{c.value}</div>
            {c.sub && <div className="mt-0.5 text-xs text-zinc-500 group-hover:text-zinc-400">{c.sub}</div>}
          </button>
        ))}
      </div>

      <Panel title="Recent activity" className="mt-6" actions={<Button size="sm" variant="outline" onClick={() => go("audit")}>Full audit log</Button>}>
        <AuditTable />
      </Panel>

      {addOpen && <AddCustomerDialog onClose={() => setAddOpen(false)} />}
    </>
  );
}
