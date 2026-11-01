"use client";

/**
 * Admin → Auto-fix.
 *
 * The one screen an operator needs for "some of my channels don't work". It explains the
 * automation in one sentence, runs the health doctor with one button (repeatedly, until the
 * whole catalog is checked), and lists the channels the doctor took out of the catalog so a
 * wrong call can be undone with one click.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Radio,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  fetchHealth,
  fetchHiddenChannels,
  restoreChannel,
  runHealthSweep,
  type HealthSweepSummary,
} from "@/lib/admin-api";
import { fmtDate } from "./shared";

export function HealthSection({ onOpenChannels }: { onOpenChannels?: () => void } = {}) {
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<HealthSweepSummary | null>(null);

  const healthQuery = useQuery({ queryKey: ["admin-health"], queryFn: fetchHealth, refetchInterval: 30_000 });
  const hiddenQuery = useQuery({ queryKey: ["admin-hidden"], queryFn: fetchHiddenChannels });

  const sweep = useMutation({
    mutationFn: () => runHealthSweep({ batch: 120 }),
    onSuccess: (result) => {
      setLastRun(result.summary);
      const { probed, disabled, channelsHidden, remaining } = result.summary;
      if (probed === 0) {
        toast.success("Everything is already checked — nothing left to scan.");
      } else {
        toast.success(
          `Checked ${probed} sources · ${disabled} removed${channelsHidden ? ` · ${channelsHidden} channels hidden` : ""}` +
            (remaining > 0 ? ` · ${remaining} queued` : ""),
        );
      }
      queryClient.invalidateQueries({ queryKey: ["admin-health"] });
      queryClient.invalidateQueries({ queryKey: ["admin-hidden"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: (id: string) => restoreChannel(id),
    onSuccess: () => {
      toast.success("Channel is back in the catalog.");
      queryClient.invalidateQueries({ queryKey: ["admin-hidden"] });
      queryClient.invalidateQueries({ queryKey: ["admin-health"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const health = healthQuery.data;
  const hidden = hiddenQuery.data?.items ?? [];
  const neverChecked = health?.streams.total ? health.streams.unchecked : 0;
  const busy = sweep.isPending;

  return (
    <div className="space-y-4">
      {/* Plain-language explainer + one button */}
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-emerald-500/[0.07] to-transparent p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Dead channels fix themselves
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              Every source you add — M3U playlist, Xtream panel or Stalker portal — is tested on the server.
              A stream that keeps failing is removed from the catalog automatically, and the channel comes back
              the moment any of its other sources works. Customers never see a channel that cannot play, and the
              player switches server on its own.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {health?.lastCheckedAt
                ? `Last check: ${fmtDate(health.lastCheckedAt)}`
                : "Nothing checked yet — run the first scan now."}
              {" · "}
              {neverChecked.toLocaleString("en-IN")} source{neverChecked === 1 ? "" : "s"} still to check
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-500"
              disabled={busy}
              onClick={() => sweep.mutate()}
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              {busy ? "Scanning…" : "Scan & fix now"}
            </Button>
            {onOpenChannels && (
              <Button size="sm" variant="ghost" className="text-zinc-400" onClick={onOpenChannels}>
                Inspect per-channel sources →
              </Button>
            )}
          </div>
        </div>

        {lastRun && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniStat label="Checked" value={lastRun.probed} />
            <MiniStat label="Working" value={lastRun.ok} tone="text-emerald-300" />
            <MiniStat label="Failed" value={lastRun.failed} tone="text-rose-300" />
            <MiniStat label="Removed" value={lastRun.disabled} tone="text-rose-300" />
            <MiniStat label="Recovered" value={lastRun.recovered} tone="text-emerald-300" />
          </div>
        )}
      </div>

      {/* Snapshot */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={Radio}
          label="Channels working"
          value={health ? health.channels.ok.toLocaleString("en-IN") : "—"}
          hint={health ? `${health.channels.total.toLocaleString("en-IN")} total` : undefined}
          tone="emerald"
        />
        <Tile
          icon={AlertTriangle}
          label="Partly broken"
          value={health ? health.channels.degraded.toLocaleString("en-IN") : "—"}
          hint="Playing, but a source is dead"
          tone="amber"
        />
        <Tile
          icon={Trash2}
          label="Removed (dead)"
          value={health ? health.channels.hidden.toLocaleString("en-IN") : "—"}
          hint="Back automatically when fixed"
          tone="rose"
        />
        <Tile
          icon={Activity}
          label="Sources removed"
          value={health ? health.streams.disabled.toLocaleString("en-IN") : "—"}
          hint={health ? `${health.streams.active.toLocaleString("en-IN")} live sources` : undefined}
          tone="zinc"
        />
      </div>

      {/* Hidden channels */}
      <div className="rounded-xl border border-zinc-800">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Trash2 className="h-4 w-4 text-rose-400" /> Removed automatically
          </h3>
          <span className="text-xs text-zinc-500">{hidden.length} shown</span>
        </div>
        {hiddenQuery.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : hidden.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-zinc-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Nothing is hidden — every channel has a working source.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {hidden.map((channel) => (
              <li key={channel.id} className="flex items-center gap-3 px-4 py-2.5">
                {channel.logo ? (
                  <img src={channel.logo} alt="" className="h-8 w-8 rounded bg-zinc-900 object-contain p-0.5" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-zinc-900 text-zinc-600">
                    <Radio className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-200">{channel.name}</p>
                  <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <Clock className="h-3 w-3" /> removed {channel.autoHiddenAt ? fmtDate(channel.autoHiddenAt) : "recently"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-zinc-700"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(channel.id)}
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
          Restoring is safe: if the sources are still dead, the next scan removes the channel again.
        </p>
      </div>

      {/* Fully-automatic setup */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <h3 className="font-semibold text-zinc-200">Run it automatically (recommended)</h3>
        <p className="mt-1 text-zinc-400">
          Add this to any scheduler — Vercel Cron, GitHub Actions, or a systemd timer — and the catalog keeps itself
          clean without anyone pressing a button.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/60 p-3 text-[11px] leading-relaxed text-emerald-300">
{`curl -fsS -X POST https://your-host/api/cron/health \\
  -H "authorization: Bearer $CRON_SECRET"`}
        </pre>
        <p className="mt-2 text-xs text-zinc-500">
          Set <code className="text-zinc-300">CRON_SECRET</code> in the environment first; the endpoint refuses to run
          without it. Every run tests the next batch and stops on a time budget, so it is safe to call every 10 minutes.
        </p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone = "text-zinc-200" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${tone}`}>{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: "emerald" | "amber" | "rose" | "zinc";
}) {
  const tones = {
    emerald: "text-emerald-400 bg-emerald-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    rose: "text-rose-400 bg-rose-500/10",
    zinc: "text-zinc-400 bg-zinc-500/10",
  } as const;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}
