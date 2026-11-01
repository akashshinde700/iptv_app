"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Layers, Loader2, Play, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SourcePreview } from "@/components/SourcePreview";
import { api, withQuery } from "./api";
import { useRoute } from "./router";
import {
  Chips,
  EmptyState,
  ErrorBox,
  OrgSelect,
  PageHeader,
  Pager,
  Panel,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  inputCls,
} from "./ui";

interface FailoverChannel {
  id: string;
  identityKey: string;
  name: string;
  logo: string | null;
  totalSources: number;
  workingSources: number;
  health: "working" | "degraded" | "nobackup" | "failed";
}
interface FailoverStats {
  total: number;
  working: number;
  nobackup: number;
  failed: number;
}
interface ChannelSource {
  streamId: string;
  channelId: string;
  provider: string;
  providerType: string | null;
  manual: boolean;
  quality: string | null;
  priority: number;
  status: string;
  failureCount: number;
  previewUrl: string;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "working", label: "Working" },
  { value: "nobackup", label: "No backup" },
  { value: "failed", label: "Failed" },
];

const HEALTH: Record<FailoverChannel["health"], { label: string; dot: string; text: string }> = {
  working: { label: "Working", dot: "bg-emerald-500", text: "text-emerald-400" },
  degraded: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-400" },
  nobackup: { label: "No backup", dot: "bg-sky-500", text: "text-sky-400" },
  failed: { label: "Failed", dot: "bg-red-500", text: "text-red-400" },
};

export function ChannelHealthSection() {
  const { route, setQuery } = useRoute();
  const org = route.query.org ?? "";
  const filter = route.query.hf ?? "all";
  const page = Math.max(1, Number.parseInt(route.query.page ?? "1", 10) || 1);
  const [searchDraft, setSearchDraft] = useState(route.query.q ?? "");
  const search = route.query.q ?? "";

  const [manage, setManage] = useState<FailoverChannel | null>(null);

  const query = useQuery({
    queryKey: ["failover", org, filter, search, page],
    queryFn: () =>
      api<{ items: FailoverChannel[]; stats: FailoverStats; total: number; totalPages: number }>(
        withQuery("/api/platform/channels/failover", { organizationId: org, filter, search, page })
      ),
    placeholderData: keepPreviousData,
  });

  const stats = query.data?.stats;
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Channel health & failover"
        description="Har channel ke saare sources (portals ke across) aur unki health — ek dead ho to player agla try karta hai."
      />

      <div className="flex flex-wrap items-center gap-2">
        <OrgSelect value={org} onChange={(v) => setQuery({ org: v === "ALL" ? undefined : v, page: undefined })} />
        <form
          className="relative flex-1 min-w-[220px]"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery({ q: searchDraft.trim() || undefined, page: undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search channel…"
            className={`${inputCls} pl-9`}
          />
        </form>
        <Chips label="Health" options={FILTERS} value={filter} onChange={(v) => setQuery({ hf: v === "all" ? undefined : v, page: undefined })} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total channels" value={stats?.total} tone="text-zinc-100" />
        <Stat label="Working" value={stats?.working} tone="text-emerald-400" />
        <Stat label="No backup" value={stats?.nobackup} tone="text-sky-400" />
        <Stat label="Failed" value={stats?.failed} tone="text-red-400" />
      </div>

      {query.isError ? (
        <ErrorBox error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <Panel>
          <TableShell minWidth={720}>
            <thead>
              <tr>
                <Th>Channel</Th>
                <Th className="text-center">Sources</Th>
                <Th className="text-center">Working</Th>
                <Th>Health</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <TableSkeleton rows={8} cols={5} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={Layers} title="No channels" message="Is filter me koi channel nahi mila." />
                  </td>
                </tr>
              ) : (
                items.map((c) => {
                  const h = HEALTH[c.health];
                  return (
                    <tr key={c.id} className="border-t border-zinc-800/70">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          {c.logo ? (
                            <img src={c.logo} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded bg-zinc-900 object-contain p-0.5" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-900 text-zinc-600">
                              <Layers className="h-4 w-4" />
                            </div>
                          )}
                          <span className="font-medium text-zinc-100">{c.name}</span>
                        </div>
                      </Td>
                      <Td className="text-center tabular-nums text-zinc-300">{c.totalSources}</Td>
                      <Td className="text-center tabular-nums">
                        <span className={c.workingSources === 0 ? "text-red-400" : c.workingSources < c.totalSources ? "text-amber-400" : "text-emerald-400"}>
                          {c.workingSources}/{c.totalSources}
                        </span>
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${h.text}`}>
                          <span className={`h-2 w-2 rounded-full ${h.dot}`} /> {h.label}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => setManage(c)}>
                          Manage
                        </Button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
          <Pager page={page} totalPages={query.data?.totalPages ?? 1} total={query.data?.total ?? 0} onPage={(p) => setQuery({ page: p === 1 ? undefined : String(p) })} />
        </Panel>
      )}

      {manage && <ManageDialog channel={manage} onClose={() => setManage(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value === undefined ? "—" : value.toLocaleString("en-IN")}</div>
    </div>
  );
}

function ManageDialog({ channel, onClose }: { channel: FailoverChannel; onClose: () => void }) {
  const qc = useQueryClient();
  const [checking, setChecking] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChannelSource | null>(null);

  const sourcesQuery = useQuery({
    queryKey: ["channel-sources", channel.id],
    queryFn: () => api<{ sources: ChannelSource[] }>(`/api/platform/channels/${channel.id}/sources`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["channel-sources", channel.id] });
    qc.invalidateQueries({ queryKey: ["failover"] });
  };

  const check = useMutation({
    mutationFn: (s: ChannelSource) => api<{ ok: boolean; detail: string }>(`/api/platform/channels/${s.channelId}/streams/${s.streamId}/check`, { method: "POST" }),
    onMutate: (s) => setChecking(s.streamId),
    onSettled: () => setChecking(null),
    onSuccess: (res) => {
      toast[res.ok ? "success" : "error"](res.ok ? `Working ✅ (${res.detail})` : `Not reachable — ${res.detail}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (s: ChannelSource) => api(`/api/platform/channels/${s.channelId}/streams/${s.streamId}`, { method: "PATCH", body: { status: s.status === "DISABLED" ? "ACTIVE" : "DISABLED" } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const setPriority = useMutation({
    mutationFn: (v: { s: ChannelSource; priority: number }) => api(`/api/platform/channels/${v.s.channelId}/streams/${v.s.streamId}`, { method: "PATCH", body: { priority: v.priority } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (s: ChannelSource) => api(`/api/platform/channels/${s.channelId}/streams/${s.streamId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Source removed");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setChannel = useMutation({
    mutationFn: (action: "disable" | "enable") => api(`/api/platform/channels/${channel.id}`, { method: "PATCH", body: { action } }),
    onSuccess: (_r, action) => {
      toast.success(action === "disable" ? "Channel disabled — customers ko nahi dikhega" : "Channel enabled");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => api(`/api/platform/channels/${channel.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Channel deleted");
      qc.invalidateQueries({ queryKey: ["failover"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sources = sourcesQuery.data?.sources ?? [];
  const allDisabled = sources.length > 0 && sources.every((s) => s.status === "DISABLED");
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-zinc-800 bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Activity className="h-5 w-5 text-amber-500" /> {channel.name}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-zinc-500">
          Sources failover order me (upar = pehle try). Lower priority number = higher preference. Ek source 5 baar fail ho to
          auto-disable — channel kabhi disable nahi hota. <span className="text-zinc-400">▶ Preview se source ko chala ke dekho.</span>
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
            <div className="py-8 text-center text-zinc-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
          ) : sources.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">Koi source nahi.</div>
          ) : (
            sources.map((s, idx) => {
              const disabled = s.status === "DISABLED";
              return (
                <div key={s.streamId} className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${disabled ? "border-red-900/50 bg-red-950/20" : "border-zinc-800 bg-zinc-900/40"}`}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-800 text-xs font-bold text-zinc-300">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-100">{s.provider}</span>
                      {s.providerType && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{s.providerType}</span>}
                      {s.manual && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Manual</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className={`inline-flex items-center gap-1 ${disabled ? "text-red-400" : "text-emerald-400"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${disabled ? "bg-red-500" : "bg-emerald-500"}`} />
                        {disabled ? "DISABLED" : "WORKING"}
                      </span>
                      <span>· fails {s.failureCount}/5</span>
                      {s.quality && <span>· {s.quality}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                      P
                      <input
                        type="number"
                        defaultValue={s.priority}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== s.priority) setPriority.mutate({ s, priority: v });
                        }}
                        className={`${inputCls} h-8 w-16 px-1 text-center`}
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-8 border-zinc-700 ${preview?.streamId === s.streamId ? "text-amber-400" : ""}`}
                      title="Preview — source ko chala ke dekho"
                      onClick={() => setPreview((p) => (p?.streamId === s.streamId ? null : s))}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 border-zinc-700" title="Check (HTTP probe)" disabled={checking === s.streamId} onClick={() => check.mutate(s)}>
                      {checking === s.streamId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" className={`h-8 border-zinc-700 ${disabled ? "text-emerald-400" : "text-amber-400"}`} onClick={() => toggle.mutate(s)}>
                      {disabled ? "Enable" : "Disable"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 border-zinc-700 text-red-400 hover:bg-red-950" onClick={() => remove.mutate(s)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <AddSource channelId={channel.id} onAdded={refresh} />

        {/* Channel-level actions: hide from customers, or remove entirely. */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3">
          <span className="text-xs text-zinc-500">
            {allDisabled ? "Ye channel abhi customers ko nahi dikh raha (saare sources off)." : "Poore channel ko customers se chhupao ya hata do."}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className={`h-8 border-zinc-700 ${allDisabled ? "text-emerald-400" : "text-amber-400"}`}
              disabled={setChannel.isPending}
              onClick={() => setChannel.mutate(allDisabled ? "enable" : "disable")}
            >
              {allDisabled ? "Enable channel" : "Disable (hide)"}
            </Button>
            {confirmDel ? (
              <>
                <span className="text-xs text-red-300">Pakka?</span>
                <Button size="sm" variant="outline" className="h-8 border-red-500/50 bg-red-950/40 text-red-300" disabled={del.isPending} onClick={() => del.mutate()}>
                  {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setConfirmDel(false)}>No</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-8 border-zinc-700 text-red-400 hover:bg-red-950" onClick={() => setConfirmDel(true)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete channel
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddSource({ channelId, onAdded }: { channelId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("50");

  const add = useMutation({
    mutationFn: () => api<{ ok: boolean }>(`/api/platform/channels/${channelId}/streams`, { method: "POST", body: { url: url.trim(), title: title.trim() || undefined, priority: Number(priority) || 50 } }),
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
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Stream URL — https://…/stream.m3u8" className={inputCls} />
      <div className="flex gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Label (optional)" className={inputCls} />
        <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Priority" className={`${inputCls} w-28`} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" disabled={!url.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Add
        </Button>
      </div>
    </div>
  );
}
