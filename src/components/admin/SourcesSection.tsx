"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Ban,
  CheckCircle2,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourcePreview } from "@/components/SourcePreview";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  addSource,
  checkSource,
  fetchChannelSources,
  fetchFailoverChannels,
  removeSource,
  updateSource,
  type ChannelSource,
  type FailoverChannel,
} from "@/lib/admin-api";
import { fmtNumber } from "./shared";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "working", label: "Working" },
  { key: "nobackup", label: "No Backup" },
  { key: "failed", label: "Failed" },
] as const;

const HEALTH_META: Record<FailoverChannel["health"], { label: string; dot: string; text: string }> = {
  working: { label: "Working", dot: "bg-emerald-500", text: "text-emerald-400" },
  degraded: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-400" },
  nobackup: { label: "No backup", dot: "bg-sky-500", text: "text-sky-400" },
  failed: { label: "Failed", dot: "bg-red-500", text: "text-red-400" },
};

export function SourcesSection() {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [manage, setManage] = useState<FailoverChannel | null>(null);

  const listQuery = useQuery({
    queryKey: ["failover", search, filter, page],
    queryFn: () => fetchFailoverChannels({ search, filter, page }),
  });

  const stats = listQuery.data?.stats;
  const items = listQuery.data?.items ?? [];
  const totalPages = listQuery.data?.totalPages ?? 1;

  const submitSearch = () => {
    setPage(1);
    setSearch(draft.trim());
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Layers className="h-6 w-6 text-primary" /> Multi-source failover
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Har channel ke saare sources (portals ke across) aur unki health — ek dead ho to player agla try
          karta hai. Yahan se sources check / enable / disable / add karo.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total channels" value={stats?.total} icon={Layers} tone="text-zinc-200" />
        <StatCard label="Working" value={stats?.working} icon={CheckCircle2} tone="text-emerald-400" />
        <StatCard label="No backup" value={stats?.nobackup} icon={ShieldAlert} tone="text-sky-400" />
        <StatCard label="Failed" value={stats?.failed} icon={Ban} tone="text-red-400" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch()}
            placeholder="Search channel…"
            className="border-zinc-800 bg-zinc-950 pl-9"
          />
        </div>
        <Button onClick={submitSearch} variant="secondary">Search</Button>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setPage(1);
                setFilter(f.key);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f.key ? "bg-primary text-primary-foreground" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Channel table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead>Channel</TableHead>
              <TableHead className="text-center">Sources</TableHead>
              <TableHead className="text-center">Working</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-zinc-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-zinc-500">
                  Koi channel nahi mila.
                </TableCell>
              </TableRow>
            ) : (
              items.map((c) => {
                const h = HEALTH_META[c.health];
                return (
                  <TableRow key={c.id} className="border-zinc-800">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {c.logo ? (
                          <img src={c.logo} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded bg-zinc-900 object-contain p-0.5" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-900 text-zinc-600">
                            <Zap className="h-4 w-4" />
                          </div>
                        )}
                        <span className="font-medium text-zinc-100">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-zinc-300">{c.totalSources}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      <span className={c.workingSources === 0 ? "text-red-400" : c.workingSources < c.totalSources ? "text-amber-400" : "text-emerald-400"}>
                        {c.workingSources}/{c.totalSources}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", h.text)}>
                        <span className={cn("h-2 w-2 rounded-full", h.dot)} /> {h.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => setManage(c)}>
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" className="border-zinc-700" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-zinc-400">
            Page {page} / {totalPages}
          </span>
          <Button size="sm" variant="outline" className="border-zinc-700" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {manage && <ManageDialog channel={manage} onClose={() => setManage(null)} />}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>{value === undefined ? "—" : fmtNumber(value)}</div>
    </div>
  );
}

function ManageDialog({ channel, onClose }: { channel: FailoverChannel; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChannelSource | null>(null);

  const sourcesQuery = useQuery({
    queryKey: ["channel-sources", channel.id],
    queryFn: () => fetchChannelSources(channel.id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["channel-sources", channel.id] });
    queryClient.invalidateQueries({ queryKey: ["failover"] });
  };

  const check = useMutation({
    mutationFn: (s: ChannelSource) => checkSource(s.channelId, s.streamId),
    onMutate: (s) => setChecking(s.streamId),
    onSettled: () => setChecking(null),
    onSuccess: (res) => {
      toast[res.ok ? "success" : "error"](res.ok ? `Working ✅ (${res.detail})` : `Not reachable — ${res.detail}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (s: ChannelSource) => updateSource(s.channelId, s.streamId, { status: s.status === "DISABLED" ? "ACTIVE" : "DISABLED" }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const setPriority = useMutation({
    mutationFn: (v: { s: ChannelSource; priority: number }) => updateSource(v.s.channelId, v.s.streamId, { priority: v.priority }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (s: ChannelSource) => removeSource(s.channelId, s.streamId),
    onSuccess: () => {
      toast.success("Source removed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sources = sourcesQuery.data?.sources ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> {channel.name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-zinc-500">
          Sources failover order me (upar = pehle try hota hai). Lower priority number = higher preference.
          Ek source 5 baar fail ho to auto-disable ho jata hai — channel kabhi disable nahi hota.
          <span className="text-zinc-400"> ▶ Preview se source chala ke dekho.</span>
        </p>

        {preview && (
          <SourcePreview
            key={preview.streamId}
            url={preview.previewUrl}
            label={`${preview.provider}${preview.providerType ? ` · ${preview.providerType}` : ""}`}
            onClose={() => setPreview(null)}
          />
        )}

        <div className="space-y-2">
          {sourcesQuery.isLoading ? (
            <div className="py-8 text-center text-zinc-500">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          ) : sources.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">Koi source nahi.</div>
          ) : (
            sources.map((s, idx) => {
              const disabled = s.status === "DISABLED";
              return (
                <div
                  key={s.streamId}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-lg border p-3",
                    disabled ? "border-red-900/50 bg-red-950/20" : "border-zinc-800 bg-zinc-900/40"
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-800 text-xs font-bold text-zinc-300">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-100">{s.provider}</span>
                      {s.providerType && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{s.providerType}</span>
                      )}
                      {s.manual && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">Manual</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className={cn("inline-flex items-center gap-1", disabled ? "text-red-400" : "text-emerald-400")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", disabled ? "bg-red-500" : "bg-emerald-500")} />
                        {disabled ? "DISABLED" : "WORKING"}
                      </span>
                      <span>· fails {s.failureCount}/5</span>
                      {s.quality && <span>· {s.quality}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                      P
                      <Input
                        type="number"
                        defaultValue={s.priority}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== s.priority) setPriority.mutate({ s, priority: v });
                        }}
                        className="h-8 w-16 border-zinc-700 bg-zinc-950 text-center"
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-8 border-zinc-700", preview?.streamId === s.streamId && "text-primary")}
                      title="Preview — source chala ke dekho"
                      onClick={() => setPreview((p) => (p?.streamId === s.streamId ? null : s))}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-zinc-700"
                      title="Check (HTTP probe)"
                      disabled={checking === s.streamId}
                      onClick={() => check.mutate(s)}
                    >
                      {checking === s.streamId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-8 border-zinc-700", disabled ? "text-emerald-400" : "text-amber-400")}
                      onClick={() => toggle.mutate(s)}
                    >
                      {disabled ? "Enable" : "Disable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-zinc-700 text-red-400 hover:bg-red-950"
                      onClick={() => remove.mutate(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <AddSourceForm channelId={channel.id} onAdded={refresh} />
      </DialogContent>
    </Dialog>
  );
}

function AddSourceForm({ channelId, onAdded }: { channelId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("50");

  const add = useMutation({
    mutationFn: () => addSource(channelId, { url: url.trim(), title: title.trim() || undefined, priority: Number(priority) || 50 }),
    onSuccess: () => {
      toast.success("Fallback source added ✅");
      setUrl("");
      setTitle("");
      setOpen(false);
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) {
    return (
      <Button variant="outline" className="w-full border-dashed border-zinc-700" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" /> Add source
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Stream URL</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/stream.m3u8" className="border-zinc-700 bg-zinc-950" />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Label (optional)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Backup CDN" className="border-zinc-700 bg-zinc-950" />
        </div>
        <div className="w-24 space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="border-zinc-700 bg-zinc-950" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" disabled={!url.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}
