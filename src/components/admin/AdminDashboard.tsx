"use client";

/* Admin Dashboard — KPI cards (all counts DYNAMIC from DB) + breakdowns + activity. */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchAdminStats, type AdminStats } from "@/lib/admin-api";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Globe2,
  Languages,
  Radio,
  ShieldCheck,
  Tv,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { fmtDate, fmtNumber } from "./shared";

function Kpi({
  title,
  value,
  sub,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`bg-zinc-900/60 border-zinc-800 ${onClick ? "cursor-pointer transition hover:border-zinc-600 hover:bg-zinc-900" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${tone}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-white">{value}</div>
        {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className="bg-zinc-900/60 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-zinc-300">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-zinc-500">No data</p>}
        {rows.slice(0, 8).map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="capitalize text-zinc-300">{row.key}</span>
              <span className="text-zinc-500">{fmtNumber(row.count)}</span>
            </div>
            <Progress value={(row.count / max) * 100} className="h-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdminDashboard({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { data, isLoading, error } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="py-24 text-center text-zinc-500">Dashboard load ho raha hai…</div>;
  }
  if (error || !data) {
    return <div className="py-24 text-center text-red-400">Stats load nahi hue: {(error as Error)?.message}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          title="Total Customers"
          value={fmtNumber(data.customers.total)}
          sub={`${data.customers.withPlan} with plan`}
          icon={Users}
          tone="text-amber-400"
          onClick={() => onNavigate("customers")}
        />
        <Kpi
          title="Active Customers"
          value={fmtNumber(data.customers.active)}
          sub={`${data.customers.inactive} inactive • ${data.customers.suspended} suspended`}
          icon={UserCheck}
          tone="text-emerald-400"
          onClick={() => onNavigate("customers")}
        />
        <Kpi
          title="Total Live Channels"
          value={fmtNumber(data.channels.total)}
          sub={`${fmtNumber(data.channels.active)} active • ${data.channels.fromPortals} from portals`}
          icon={Tv}
          tone="text-rose-400"
          onClick={() => onNavigate("channels")}
        />
        <Kpi
          title="Stalker Portals & Sources"
          value={fmtNumber(data.portals.total)}
          sub={
            data.portals.needsAttention > 0
              ? `⚠ ${data.portals.needsAttention} need attention`
              : "All sources healthy"
          }
          icon={Radio}
          tone={data.portals.needsAttention > 0 ? "text-red-400" : "text-emerald-400"}
          onClick={() => onNavigate("portals")}
        />
        <Kpi
          title="Plans"
          value={`${data.plans.active} / ${data.plans.total}`}
          sub="active / total"
          icon={Wallet}
          tone="text-emerald-400"
          onClick={() => onNavigate("plans")}
        />
        <Kpi
          title="Adult Channels"
          value={fmtNumber(data.channels.adult)}
          sub="gated by plan permission"
          icon={ShieldCheck}
          tone="text-purple-400"
          onClick={() => onNavigate("channels")}
        />
        <Kpi
          title="Last Portal Sync"
          value={data.portals.lastSyncedAt ? fmtDate(data.portals.lastSyncedAt).split(",")[0] : "—"}
          sub={data.portals.lastSyncedAt ? fmtDate(data.portals.lastSyncedAt) : "Abhi tak sync nahi hua"}
          icon={Activity}
          tone="text-sky-400"
          onClick={() => onNavigate("portals")}
        />
        <Kpi
          title="Regions Covered"
          value={String(data.breakdown.byRegion.length)}
          sub={`${data.breakdown.byCountry.length}+ countries • ${data.breakdown.byLanguage.length}+ languages`}
          icon={Globe2}
          tone="text-amber-400"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <BreakdownCard title="Region-wise Channels" rows={data.breakdown.byRegion} />
        <BreakdownCard title="Top Countries" rows={data.breakdown.byCountry} />
        <BreakdownCard title="Top Languages" rows={data.breakdown.byLanguage} />
        <BreakdownCard title="Top Categories" rows={data.breakdown.byCategory} />
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Languages className="h-4 w-4" /> Recent Admin Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 && <p className="text-sm text-zinc-500">Abhi koi activity nahi.</p>}
          <ul className="divide-y divide-zinc-800/60">
            {data.recentActivity.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-xs text-amber-300">{item.action}</span>
                <span className="text-zinc-500">
                  {item.adminName} • {fmtDate(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
