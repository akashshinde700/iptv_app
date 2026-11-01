"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Plug,
  Power,
  RefreshCw,
  Rss,
  Search,
  Tv,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiFailure, withQuery, type SourceChannelRow, type SourceRow, type SourceSummary, type SourceType, type SyncLogRow, type TestResult } from "./api";
import { AuditTable } from "./Audit";
import { useRoute } from "./router";
import { ActionConfirm } from "./SubscriptionDialogs";
import {
  Chips,
  ConfirmDialog,
  DaysLeft,
  EmptyState,
  ErrorBox,
  Field,
  fmtDate,
  fmtDateTime,
  inputCls,
  OrgSelect,
  PageHeader,
  Pager,
  Panel,
  StatePill,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  useDebounced,
} from "./ui";

const TYPE_LABELS: Record<SourceType, string> = {
  STALKER: "Stalker / MAC portal",
  XTREAM: "Xtream Codes",
  M3U_URL: "M3U URL",
  M3U_FILE: "M3U file",
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "ACTIVE",
  ERROR: "FAILED",
  SYNCING: "PENDING",
  PENDING: "PENDING",
  INACTIVE: "SUSPENDED",
};

function sourceHealth(s: SourceRow): string {
  if (!s.isActive) return "DISABLED";
  if (s.status === "ERROR") return "FAILED";
  if (s.status === "ACTIVE") return "ACTIVE";
  return "PENDING";
}

/* ------------------------------- list page ------------------------------- */

export function ContentSourcesSection() {
  const { route } = useRoute();
  return route.id ? <SourceDetailView sourceId={route.id} /> : <SourcesList />;
}

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "ERROR", label: "Failed" },
  { value: "PENDING", label: "Pending" },
  { value: "DISABLED", label: "Disabled" },
];

function SourcesList() {
  const { route, setQuery, go } = useRoute();
  const [addOpen, setAddOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(route.query.q ?? "");
  const search = useDebounced(searchDraft, 350);
  const org = route.query.org ?? "";
  const type = route.query.type ?? "ALL";
  const status = route.query.status ?? "ALL";
  if (search !== (route.query.q ?? "")) setQuery({ q: search });

  const query = useQuery({
    queryKey: ["platform", "sources", org, type, status, search],
    queryFn: () => api<{ items: SourceRow[]; summary: SourceSummary }>(withQuery("/api/platform/sources", { organizationId: org, type, status, search })),
    placeholderData: keepPreviousData,
  });
  const summary = query.data?.summary;

  const cards = summary
    ? [
        { label: "Total sources", value: summary.total, icon: Rss, tone: "" },
        { label: "Active", value: summary.active, icon: CheckCircle2, tone: "text-emerald-400" },
        { label: "Failed", value: summary.failed, icon: XCircle, tone: summary.failed > 0 ? "text-red-400" : "" },
        { label: "Disabled", value: summary.disabled, icon: Power, tone: "" },
        { label: "Channels", value: summary.totalChannels.toLocaleString("en-IN"), icon: Tv, tone: "" },
        { label: "Last sync", value: summary.lastSyncedAt ? fmtDate(summary.lastSyncedAt) : "Never", icon: RefreshCw, tone: "" },
      ]
    : [];

  const hasFilters = type !== "ALL" || status !== "ALL" || !!org || !!search;

  return (
    <>
      <PageHeader
        title="Content Sources"
        description="IPTV portals and playlists that feed channels into the catalog. Test a source before you sync it."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plug className="mr-1.5 h-4 w-4" /> Add source
          </Button>
        }
      />

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                {c.label} <c.icon className={`h-4 w-4 ${c.tone || "text-zinc-500"}`} aria-hidden />
              </div>
              <div className="mt-1 text-xl font-bold text-white">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input className={`${inputCls} pl-9`} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search name or host" aria-label="Search sources" />
        </div>
        <OrgSelect value={org} onChange={(v) => setQuery({ org: v === "ALL" ? undefined : v })} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Chips label="Status" options={STATUS_FILTERS} value={status} onChange={(v) => setQuery({ status: v })} />
        <span className="text-zinc-700">·</span>
        <Chips
          label="Type"
          options={[{ value: "ALL", label: "All types" }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))]}
          value={type}
          onChange={(v) => setQuery({ type: v })}
        />
      </div>

      {query.isError && <ErrorBox error={query.error} onRetry={() => query.refetch()} />}
      {query.isLoading ? (
        <TableSkeleton cols={6} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-zinc-800">
          <EmptyState
            icon={Rss}
            title={hasFilters ? "No sources match these filters" : "No content sources yet"}
            message={hasFilters ? undefined : "Add a Stalker portal, an M3U link or an Xtream account to import channels."}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => setQuery({ q: undefined, org: undefined, type: undefined, status: undefined })}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setAddOpen(true)}>
                  <Plug className="mr-1.5 h-4 w-4" /> Add source
                </Button>
              )
            }
          />
        </div>
      ) : (
        <TableShell minWidth={980}>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th>Type</Th>
              <Th>Organization</Th>
              <Th>Health</Th>
              <Th className="text-right">Channels</Th>
              <Th>Last sync</Th>
              <Th>Expiry</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {query.data?.items.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-zinc-900/60" onClick={() => go("sources", { id: s.id })}>
                <Td>
                  <div className="font-medium text-zinc-100">{s.name}</div>
                  <div className="max-w-[18rem] truncate text-xs text-zinc-500">{s.displayUrl ?? (s.type === "M3U_FILE" ? "Uploaded file" : "—")}</div>
                </Td>
                <Td className="text-zinc-300">{TYPE_LABELS[s.type]}</Td>
                <Td className="text-zinc-300">{s.organization?.name}</Td>
                <Td>
                  <StatePill value={STATUS_PILL[sourceHealth(s) === "DISABLED" ? "INACTIVE" : s.status] ?? "PENDING"} />
                  {s.status === "ERROR" && s.lastError && <div className="mt-0.5 max-w-[16rem] truncate text-xs text-red-300" title={s.lastError}>{s.lastError}</div>}
                </Td>
                <Td className="text-right tabular-nums text-zinc-300">{s.channelCount.toLocaleString("en-IN")}</Td>
                <Td className="text-xs text-zinc-400">{s.lastSyncedAt ? fmtDateTime(s.lastSyncedAt) : "Never"}</Td>
                <Td className="text-xs">{s.expiresAt ? <DaysLeft days={Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / 86400000)} /> : <span className="text-zinc-500">—</span>}</Td>
                <Td className="text-right">
                  <div onClick={(e) => e.stopPropagation()}>
                    <SourceActions source={s} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {addOpen && <AddSourceWizard presetOrgId={org} onClose={() => setAddOpen(false)} />}
    </>
  );
}

/* ------------------------------ row actions ------------------------------ */

function SourceActions({ source }: { source: SourceRow }) {
  const queryClient = useQueryClient();
  const { go } = useRoute();
  const [busy, setBusy] = useState<null | "test" | "sync">(null);
  const [confirm, setConfirm] = useState<null | "disable" | "enable" | "delete">(null);

  const run = async (kind: "test" | "sync") => {
    setBusy(kind);
    try {
      if (kind === "test") {
        const r = await api<TestResult>(`/api/platform/sources/${source.id}/test`, { method: "POST" });
        const extra = r.channelEstimate != null ? ` (~${r.channelEstimate.toLocaleString("en-IN")} channels)` : "";
        if (r.ok) toast.success(`${source.name}: ${r.message}${extra}`);
        else toast.error(`${source.name}: ${r.message}`);
      } else {
        const r = await api<{ added: number; updated: number; removed: number; total: number }>(`/api/platform/sources/${source.id}/sync`, { method: "POST" });
        toast.success(`${source.name} synced — ${r.added} new, ${r.updated} updated, ${r.removed} removed (${r.total} total)`);
      }
      queryClient.invalidateQueries({ queryKey: ["platform"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label={`Actions for ${source.name}`} disabled={!!busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => go("sources", { id: source.id })}>View source</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run("test")}>Test connection</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run("sync")} disabled={!source.isActive}>Sync channels</DropdownMenuItem>
          <DropdownMenuSeparator />
          {source.isActive ? (
            <DropdownMenuItem onSelect={() => setConfirm("disable")}>Disable</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("enable")}>Enable</DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-red-300 focus:text-red-200" onSelect={() => setConfirm("delete")}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ActionConfirm
        open={confirm === "disable"}
        onClose={() => setConfirm(null)}
        title={`Disable ${source.name}?`}
        description={`Its ${source.channelCount.toLocaleString("en-IN")} channels become unavailable to customers until you enable it again.`}
        confirmLabel="Disable"
        destructive
        run={() => api(`/api/platform/sources/${source.id}`, { method: "PATCH", body: { isActive: false } })}
        success="Source disabled"
      />
      <ActionConfirm
        open={confirm === "enable"}
        onClose={() => setConfirm(null)}
        title={`Enable ${source.name}?`}
        description="Its channels become available again (subject to plan and subscription rules)."
        confirmLabel="Enable"
        run={() => api(`/api/platform/sources/${source.id}`, { method: "PATCH", body: { isActive: true } })}
        success="Source enabled"
      />
      {confirm === "delete" && <DeleteSourceDialog source={source} onClose={() => setConfirm(null)} />}
    </>
  );
}

function DeleteSourceDialog({ source, onClose, onDeleted }: { source: SourceRow; onClose: () => void; onDeleted?: () => void }) {
  const queryClient = useQueryClient();
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Delete ${source.name}?`}
      description={`This permanently removes the source and its ${source.channelCount.toLocaleString("en-IN")} channels. Consider disabling it instead if you might need it again.`}
      confirmLabel="Delete source"
      destructive
      onConfirm={async () => {
        await api(`/api/platform/sources/${source.id}`, { method: "DELETE" });
        toast.success("Source deleted");
        queryClient.invalidateQueries({ queryKey: ["platform"] });
        onDeleted?.();
      }}
    />
  );
}

/* ------------------------------ add wizard ------------------------------ */

interface Draft {
  organizationId: string;
  name: string;
  type: SourceType;
  url: string;
  macAddress: string;
  deviceId: string;
  deviceId2: string;
  serialNumber: string;
  username: string;
  password: string;
  epgUrl: string;
  notes: string;
  fileData: string;
  fileName: string;
}

function emptyDraft(orgId: string): Draft {
  return { organizationId: orgId, name: "", type: "XTREAM", url: "", macAddress: "", deviceId: "", deviceId2: "", serialNumber: "", username: "", password: "", epgUrl: "", notes: "", fileData: "", fileName: "" };
}

function draftBody(d: Draft) {
  const body: Record<string, unknown> = { type: d.type, name: d.name || undefined, notes: d.notes || undefined, epgUrl: d.epgUrl || undefined };
  if (d.type === "STALKER") Object.assign(body, { url: d.url, macAddress: d.macAddress, deviceId: d.deviceId || undefined, deviceId2: d.deviceId2 || undefined, serialNumber: d.serialNumber || undefined });
  else if (d.type === "XTREAM") Object.assign(body, { url: d.url, username: d.username, password: d.password });
  else if (d.type === "M3U_URL") Object.assign(body, { url: d.url });
  else if (d.type === "M3U_FILE") Object.assign(body, { fileData: d.fileData });
  return body;
}

function AddSourceWizard({ presetOrgId, onClose }: { presetOrgId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { go } = useRoute();
  const [d, setD] = useState<Draft>(() => emptyDraft(presetOrgId ?? ""));
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    if (["type", "url", "macAddress", "deviceId", "deviceId2", "serialNumber", "username", "password", "fileData"].includes(k)) setTest(null);
  };

  const connectionReady = useMemo(() => {
    if (d.type === "STALKER") return !!d.url && !!d.macAddress;
    if (d.type === "XTREAM") return !!d.url && !!d.username && !!d.password;
    if (d.type === "M3U_URL") return !!d.url;
    return !!d.fileData;
  }, [d]);

  const runTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const r = await api<TestResult>("/api/platform/sources/test", { method: "POST", body: draftBody(d) });
      setTest(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const save = useMutation({
    mutationFn: async (thenSync: boolean) => {
      const res = await api<{ id: string }>("/api/platform/sources", { method: "POST", body: { organizationId: d.organizationId, ...draftBody(d) } });
      if (thenSync) {
        try {
          await api(`/api/platform/sources/${res.id}/sync`, { method: "POST" });
        } catch (e) {
          toast.warning(`Source saved but the first sync failed: ${e instanceof Error ? e.message : ""}`);
        }
      }
      return res.id;
    },
    onSuccess: (id, thenSync) => {
      toast.success(thenSync ? "Source added and channels imported" : "Source added");
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      onClose();
      go("sources", { id });
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (thenSync: boolean) => {
    if (!d.organizationId) return setError("Choose an organization.");
    if (!d.name.trim()) return setError("Give the source a name.");
    if (!connectionReady) return setError("Fill in the connection details.");
    save.mutate(thenSync);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setD((p) => ({ ...p, fileData: text, fileName: file.name, name: p.name || file.name.replace(/\.m3u8?$/i, "") }));
    setTest(null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-zinc-800 bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Add content source</DialogTitle>
          <DialogDescription className="text-zinc-400">Choose the type, enter the connection, test it, then save. Testing never imports channels.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Field label="Organization" htmlFor="src-org">
            <OrgSelect id="src-org" value={d.organizationId} onChange={(v) => set("organizationId", v)} allowAll={false} className="w-full" />
          </Field>

          <div>
            <p className="mb-1.5 text-xs text-zinc-400">Source type</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(TYPE_LABELS) as SourceType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => set("type", t)}
                  aria-pressed={d.type === t}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${d.type === t ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <Field label="Source name" htmlFor="src-name">
            <input id="src-name" className={inputCls} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Provider A — Sports pack" />
          </Field>

          {/* type-specific connection */}
          {d.type === "STALKER" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Portal URL" htmlFor="src-url" hint="e.g. http://portal.example/c/" className="sm:col-span-2">
                <input id="src-url" className={inputCls} value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="http://portal.example/c/" />
              </Field>
              <Field label="MAC address" htmlFor="src-mac" hint="00:1A:79:AA:BB:CC (dashes/no-separator also accepted)">
                <input id="src-mac" className={inputCls} value={d.macAddress} onChange={(e) => set("macAddress", e.target.value)} placeholder="00:1A:79:AA:BB:CC" />
              </Field>
              <Field label="Device ID (optional)" htmlFor="src-did" hint="Device-locked portals only — copy from TiViMate" className="sm:col-span-2">
                <input id="src-did" className={inputCls} value={d.deviceId} onChange={(e) => set("deviceId", e.target.value)} placeholder="Leave blank to auto-generate from MAC" />
              </Field>
              <Field label="Device ID 2 (optional)" htmlFor="src-did2">
                <input id="src-did2" className={inputCls} value={d.deviceId2} onChange={(e) => set("deviceId2", e.target.value)} placeholder="Same as Device ID if unsure" />
              </Field>
              <Field label="Serial number (optional)" htmlFor="src-sn">
                <input id="src-sn" className={inputCls} value={d.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} placeholder="From TiViMate (optional)" />
              </Field>
            </div>
          )}
          {d.type === "XTREAM" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Server URL" htmlFor="src-url" hint="e.g. http://host:port" className="sm:col-span-2">
                <input id="src-url" className={inputCls} value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="http://host:8080" />
              </Field>
              <Field label="Username" htmlFor="src-user">
                <input id="src-user" className={inputCls} value={d.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Password" htmlFor="src-pass">
                <input id="src-pass" type="password" className={inputCls} value={d.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
              </Field>
            </div>
          )}
          {d.type === "M3U_URL" && (
            <Field label="M3U URL" htmlFor="src-url" hint="Credentials in the URL are stored securely and masked in the panel.">
              <input id="src-url" className={inputCls} value={d.url} onChange={(e) => set("url", e.target.value)} placeholder="http://host/get.php?username=…&password=…&type=m3u_plus" />
            </Field>
          )}
          {d.type === "M3U_FILE" && (
            <Field label="Playlist file (.m3u)" htmlFor="src-file">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-300 hover:border-zinc-500">
                <Upload className="h-4 w-4" />
                {d.fileName || "Choose an .m3u file"}
                <input id="src-file" type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </Field>
          )}

          <Field label="Notes (optional)" htmlFor="src-notes">
            <input id="src-notes" className={inputCls} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>

          {/* test */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" onClick={runTest} disabled={!connectionReady || testing}>
                {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Activity className="mr-1.5 h-4 w-4" />}
                Test connection
              </Button>
              {test && (
                <span className={`flex items-center gap-1.5 text-sm ${test.ok ? "text-emerald-300" : "text-red-300"}`}>
                  {test.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {test.message}
                </span>
              )}
            </div>
            {test?.ok && (
              <p className="mt-2 text-xs text-zinc-400">
                {test.channelEstimate != null && <>~{test.channelEstimate.toLocaleString("en-IN")} channels. </>}
                {test.expiresAt && <>Expires {fmtDate(test.expiresAt)}. </>}
                {test.maxConnections != null && <>Max {test.maxConnections} connection{test.maxConnections === 1 ? "" : "s"}.</>}
              </p>
            )}
          </div>

          {error && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={save.isPending}>
            {save.isPending && save.variables === false && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save without importing
          </Button>
          <Button onClick={() => submit(true)} disabled={save.isPending}>
            {save.isPending && save.variables === true ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Save &amp; sync now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ detail page ------------------------------ */

const DETAIL_TABS = ["overview", "channels", "history", "settings"] as const;

function SourceDetailView({ sourceId }: { sourceId: string }) {
  const queryClient = useQueryClient();
  const { route, go, setQuery } = useRoute();
  const tab = (DETAIL_TABS as readonly string[]).includes(route.query.tab) ? route.query.tab : "overview";
  const [busy, setBusy] = useState<null | "test" | "sync">(null);
  const [del, setDel] = useState(false);

  const detail = useQuery({
    queryKey: ["platform", "source", sourceId],
    queryFn: () => api<{ source: SourceRow; syncLogs: SyncLogRow[] }>(`/api/platform/sources/${sourceId}`),
  });

  if (detail.isLoading) return <TableSkeleton rows={6} cols={3} />;
  if (detail.error instanceof ApiFailure && detail.error.status === 404) {
    return <EmptyState title="Source not found" action={<Button onClick={() => go("sources")}>Back to sources</Button>} />;
  }
  if (detail.isError || !detail.data) return <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />;
  const s = detail.data.source;

  const run = async (kind: "test" | "sync") => {
    setBusy(kind);
    try {
      if (kind === "test") {
        const r = await api<TestResult>(`/api/platform/sources/${sourceId}/test`, { method: "POST" });
        const extra = r.channelEstimate != null ? ` (~${r.channelEstimate.toLocaleString("en-IN")} channels)` : "";
        if (r.ok) toast.success(r.message + extra);
        else toast.error(r.message);
      } else {
        const r = await api<{ added: number; updated: number; removed: number }>(`/api/platform/sources/${sourceId}/sync`, { method: "POST" });
        toast.success(`Synced — ${r.added} new, ${r.updated} updated, ${r.removed} removed`);
      }
      queryClient.invalidateQueries({ queryKey: ["platform"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        back={{ label: "Content Sources", onClick: () => go("sources") }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {s.name} <StatePill value={STATUS_PILL[!s.isActive ? "INACTIVE" : s.status] ?? "PENDING"} />
          </span>
        }
        description={
          <>
            {TYPE_LABELS[s.type]} ·{" "}
            <button className="underline-offset-2 hover:underline" onClick={() => s.organization && go("organizations", { id: s.organization.id })}>
              {s.organization?.name}
            </button>
          </>
        }
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => run("test")} disabled={!!busy}>
              {busy === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Activity className="mr-1.5 h-4 w-4" />} Test
            </Button>
            <Button size="sm" onClick={() => run("sync")} disabled={!!busy || !s.isActive}>
              {busy === "sync" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Sync now
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setQuery({ tab: v === "overview" ? undefined : v })}>
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="channels">Channels ({s.channelCount.toLocaleString("en-IN")})</TabsTrigger>
            <TabsTrigger value="history">Sync history</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          {s.status === "ERROR" && s.lastError && (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              Last sync failed: {s.lastError}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Connection">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Type" value={TYPE_LABELS[s.type]} />
                <Info label="Host / URL" value={<span className="break-all text-xs">{s.displayUrl ?? (s.type === "M3U_FILE" ? "Uploaded file" : "—")}</span>} />
                {s.type === "STALKER" && <Info label="MAC address" value={<code className="text-xs">{s.macAddress}</code>} />}
                {s.type === "XTREAM" && <Info label="Username" value={s.username ?? "—"} />}
                {(s.type === "XTREAM" || s.type === "STALKER") && <Info label="Password" value={s.hasPassword ? "••••••••" : "—"} />}
                <Info label="EPG URL" value={s.epgUrl ? <span className="break-all text-xs">{s.epgUrl}</span> : "—"} />
              </dl>
            </Panel>
            <Panel title="Health">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Status" value={<StatePill value={STATUS_PILL[!s.isActive ? "INACTIVE" : s.status] ?? "PENDING"} />} />
                <Info label="Active channels" value={s.channelCount.toLocaleString("en-IN")} />
                <Info label="Last sync" value={s.lastSyncedAt ? fmtDateTime(s.lastSyncedAt) : "Never"} />
                <Info label="Expiry" value={s.expiresAt ? fmtDate(s.expiresAt) : "—"} />
                <Info label="Added" value={fmtDate(s.createdAt)} />
                <Info label="Enabled" value={s.isActive ? "Yes" : "No (disabled)"} />
              </dl>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="channels">
          <SourceChannels sourceId={sourceId} />
        </TabsContent>

        <TabsContent value="history">
          <SyncHistory sourceId={sourceId} initial={detail.data.syncLogs} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <EditSourcePanel source={s} />
          <Panel title="Danger zone">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-400">
                {s.isActive ? "Disabling hides this source's channels from customers. " : "This source is disabled. "}
                Deleting removes it and its channels permanently.
              </p>
              <div className="flex gap-2">
                <SourceActions source={s} />
                <Button size="sm" variant="outline" className="border-red-500/40 text-red-300 hover:bg-red-500/10" onClick={() => setDel(true)}>
                  Delete source
                </Button>
              </div>
            </div>
          </Panel>
          <Panel title="Activity">
            <AuditTable entityIds={[sourceId]} />
          </Panel>
        </TabsContent>
      </Tabs>

      {del && <DeleteSourceDialog source={s} onClose={() => setDel(false)} onDeleted={() => go("sources")} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-zinc-200">{value}</dd>
    </div>
  );
}

function SourceChannels({ sourceId }: { sourceId: string }) {
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebounced(searchDraft, 350);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["platform", "source-channels", sourceId, search, page],
    queryFn: () => api<{ items: SourceChannelRow[]; total: number; page: number; totalPages: number; categories: { name: string; count: number }[] }>(withQuery(`/api/platform/sources/${sourceId}/channels`, { search, page })),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-3">
      {query.data && query.data.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {query.data.categories.slice(0, 14).map((c) => (
            <span key={c.name} className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 text-xs text-zinc-300">
              {c.name} <span className="text-zinc-500">{c.count}</span>
            </span>
          ))}
        </div>
      )}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
        <input className={`${inputCls} pl-9`} value={searchDraft} onChange={(e) => { setSearchDraft(e.target.value); setPage(1); }} placeholder="Search channels" aria-label="Search channels" />
      </div>
      {query.isLoading ? (
        <TableSkeleton cols={3} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-zinc-800">
          <EmptyState icon={Tv} title="No channels" message="Sync this source to import its channels." />
        </div>
      ) : (
        <>
          <TableShell minWidth={620}>
            <thead>
              <tr>
                <Th>Channel</Th>
                <Th>Category</Th>
                <Th>Country</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((c) => (
                <tr key={c.id}>
                  <Td className="text-zinc-100">
                    {c.name}
                    {c.isNsfw && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-300">18+</span>}
                  </Td>
                  <Td className="text-xs text-zinc-400">{c.categories.join(", ") || "—"}</Td>
                  <Td className="text-zinc-400">{c.countryName ?? "—"}</Td>
                  <Td>{c.isActive ? <span className="text-emerald-300">Active</span> : <span className="text-zinc-500">Inactive</span>}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          {query.data && <Pager page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPage={setPage} />}
        </>
      )}
    </div>
  );
}

function SyncHistory({ sourceId, initial }: { sourceId: string; initial: SyncLogRow[] }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["platform", "source-logs", sourceId, page],
    queryFn: () => api<{ items: SyncLogRow[]; total: number; page: number; totalPages: number }>(withQuery(`/api/platform/sources/${sourceId}/logs`, { page })),
    placeholderData: keepPreviousData,
    initialData: page === 1 ? { items: initial, total: initial.length, page: 1, totalPages: 1 } : undefined,
  });
  if ((query.data?.items.length ?? 0) === 0) {
    return (
      <div className="rounded-xl border border-zinc-800">
        <EmptyState icon={RefreshCw} title="No syncs yet" message="Run a sync to import channels from this source." />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <TableShell minWidth={720}>
        <thead>
          <tr>
            <Th>Started</Th>
            <Th>Duration</Th>
            <Th>Status</Th>
            <Th className="text-right">New</Th>
            <Th className="text-right">Updated</Th>
            <Th className="text-right">Removed</Th>
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody>
          {query.data?.items.map((l) => {
            const dur = l.finishedAt ? `${Math.max(1, Math.round((new Date(l.finishedAt).getTime() - new Date(l.startedAt).getTime()) / 1000))}s` : "—";
            return (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-xs text-zinc-400">{fmtDateTime(l.startedAt)}</Td>
                <Td className="text-zinc-400">{dur}</Td>
                <Td><StatePill value={l.status === "SUCCESS" ? "ACTIVE" : l.status === "ERROR" ? "EXPIRED" : "PENDING"} /></Td>
                <Td className="text-right tabular-nums text-emerald-300">{l.added}</Td>
                <Td className="text-right tabular-nums text-zinc-300">{l.updated}</Td>
                <Td className="text-right tabular-nums text-zinc-400">{l.removed}</Td>
                <Td className="max-w-[20rem] text-xs text-zinc-400">
                  <span className="block truncate" title={l.message ?? undefined}>{l.message ?? "—"}</span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
      {query.data && query.data.totalPages > 1 && <Pager page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPage={setPage} />}
    </div>
  );
}

function EditSourcePanel({ source }: { source: SourceRow }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(source.name);
  const [notes, setNotes] = useState(source.notes ?? "");
  const [changeCreds, setChangeCreds] = useState(false);
  const [creds, setCreds] = useState({ url: source.url ?? "", macAddress: source.macAddress ?? "", username: source.username ?? "", password: "" });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { name, notes: notes || null };
      if (changeCreds) {
        if (source.type === "STALKER") Object.assign(body, { url: creds.url, macAddress: creds.macAddress });
        else if (source.type === "XTREAM") Object.assign(body, { url: creds.url, username: creds.username, password: creds.password });
        else if (source.type === "M3U_URL") Object.assign(body, { url: creds.url });
      }
      return api(`/api/platform/sources/${source.id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      toast.success("Source updated");
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      setChangeCreds(false);
      setCreds((c) => ({ ...c, password: "" }));
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Panel title="Edit source">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="edit-src-name">
          <input id="edit-src-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="edit-src-notes">
          <input id="edit-src-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {source.type !== "M3U_FILE" && (
        <div className="mt-3">
          {!changeCreds ? (
            <Button size="sm" variant="outline" onClick={() => setChangeCreds(true)}>Change connection / credentials</Button>
          ) : (
            <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <p className="text-xs text-zinc-500">The current secret is never shown. Enter new values to replace it.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={source.type === "STALKER" ? "Portal URL" : source.type === "XTREAM" ? "Server URL" : "M3U URL"} htmlFor="edit-src-url" className="sm:col-span-2">
                  <input id="edit-src-url" className={inputCls} value={creds.url} onChange={(e) => setCreds({ ...creds, url: e.target.value })} />
                </Field>
                {source.type === "STALKER" && (
                  <Field label="MAC address" htmlFor="edit-src-mac">
                    <input id="edit-src-mac" className={inputCls} value={creds.macAddress} onChange={(e) => setCreds({ ...creds, macAddress: e.target.value })} />
                  </Field>
                )}
                {source.type === "XTREAM" && (
                  <>
                    <Field label="Username" htmlFor="edit-src-user">
                      <input id="edit-src-user" className={inputCls} value={creds.username} onChange={(e) => setCreds({ ...creds, username: e.target.value })} autoComplete="off" />
                    </Field>
                    <Field label="New password" htmlFor="edit-src-pass">
                      <input id="edit-src-pass" type="password" className={inputCls} value={creds.password} onChange={(e) => setCreds({ ...creds, password: e.target.value })} autoComplete="new-password" />
                    </Field>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <div className="mt-3">
        <Button size="sm" onClick={() => { setError(null); save.mutate(); }} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save changes
        </Button>
      </div>
    </Panel>
  );
}
