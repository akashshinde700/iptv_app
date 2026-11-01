"use client";

/* Admin: Portals section — add Stalker(MAC)/Xtream/M3U link, upload M3U file, Sync Now, logs. */

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  ClipboardPaste,
  FileUp,
  History,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  bulkImportPortals,
  bulkPreviewPortals,
  createAdminPortal,
  deleteAdminPortal,
  fetchPortalLogs,
  fetchAdminPortals,
  syncAdminPortal,
  updateAdminPortal,
  uploadM3UFile,
  type AdminPortal,
  type BulkPreview,
  type SyncLogItem,
} from "@/lib/admin-api";
import { daysLeft, fmtDate, fmtNumber, PORTAL_TYPE_LABEL, StatusBadge } from "./shared";

function AddPortalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [m3uUrl, setM3uUrl] = useState("");
  const [m3uName, setM3uName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [xtServer, setXtServer] = useState("");
  const [xtUser, setXtUser] = useState("");
  const [xtPass, setXtPass] = useState("");
  const [stPanel, setStPanel] = useState("");
  const [stMac, setStMac] = useState("");

  const reset = () => {
    setM3uUrl(""); setM3uName(""); setFile(null); setFileName("");
    setXtServer(""); setXtUser(""); setXtPass(""); setStPanel(""); setStMac("");
  };

  const createPortal = useMutation({
    mutationFn: async (body: Record<string, unknown>) => createAdminPortal(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Portal add ho gaya — ab 'Sync Now' dabao");
      reset();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadFile = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("File select karo");
      return uploadM3UFile(file, fileName || file.name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("File upload ho gayi — ab 'Sync Now' dabao");
      reset();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto bg-zinc-950 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Naya Source Add Karo</DialogTitle>
        <DialogDescription>
          Stalker panel (MAC), Xtream (user/pass), M3U link ya M3U file — jo bhi hai, yahan daalo.
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="stalker" className="mt-2">
        <TabsList className="grid w-full grid-cols-4 bg-zinc-900">
          <TabsTrigger value="stalker">📡 Stalker</TabsTrigger>
          <TabsTrigger value="xtream">🔗 Xtream</TabsTrigger>
          <TabsTrigger value="m3u">🔗 M3U Link</TabsTrigger>
          <TabsTrigger value="file">📁 File</TabsTrigger>
        </TabsList>

        <TabsContent value="stalker" className="space-y-3 pt-3">
          <div className="grid gap-2">
            <Label>Panel URL</Label>
            <Input value={stPanel} onChange={(e) => setStPanel(e.target.value)} placeholder="http://xpone.nl/c/" />
          </div>
          <div className="grid gap-2">
            <Label>MAC Address</Label>
            <Input value={stMac} onChange={(e) => setStMac(e.target.value)} placeholder="00:1A:79:XX:XX:XX" />
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500"
            disabled={createPortal.isPending}
            onClick={() =>
              createPortal.mutate({ name: stPanel.replace(/^https?:\/\//, "").slice(0, 40) || "Stalker Portal", type: "STALKER", url: stPanel, macAddress: stMac })
            }
          >
            {createPortal.isPending ? "Adding…" : "Add Stalker Portal"}
          </Button>
        </TabsContent>

        <TabsContent value="xtream" className="space-y-3 pt-3">
          <div className="grid gap-2">
            <Label>Server URL</Label>
            <Input value={xtServer} onChange={(e) => setXtServer(e.target.value)} placeholder="http://skyfilex.fun:80" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Username</Label>
              <Input value={xtUser} onChange={(e) => setXtUser(e.target.value)} placeholder="249433528395" />
            </div>
            <div className="grid gap-2">
              <Label>Password</Label>
              <Input value={xtPass} onChange={(e) => setXtPass(e.target.value)} placeholder="••••••" />
            </div>
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500"
            disabled={createPortal.isPending}
            onClick={() =>
              createPortal.mutate({ name: xtServer.replace(/^https?:\/\//, "").slice(0, 40) || "Xtream", type: "XTREAM", url: xtServer, username: xtUser, password: xtPass })
            }
          >
            {createPortal.isPending ? "Adding…" : "Add Xtream Source"}
          </Button>
        </TabsContent>

        <TabsContent value="m3u" className="space-y-3 pt-3">
          <div className="grid gap-2">
            <Label>M3U Playlist Link</Label>
            <Input
              value={m3uUrl}
              onChange={(e) => setM3uUrl(e.target.value)}
              placeholder="http://host/get.php?username=…&type=m3u_plus"
            />
          </div>
          <div className="grid gap-2">
            <Label>Name (optional)</Label>
            <Input value={m3uName} onChange={(e) => setM3uName(e.target.value)} placeholder="Snehal List" />
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500"
            disabled={createPortal.isPending}
            onClick={() =>
              createPortal.mutate({ name: m3uName || m3uUrl.replace(/^https?:\/\//, "").slice(0, 40) || "M3U Link", type: "M3U_URL", url: m3uUrl })
            }
          >
            {createPortal.isPending ? "Adding…" : "Add M3U Link"}
          </Button>
        </TabsContent>

        <TabsContent value="file" className="space-y-3 pt-3">
          <div className="grid gap-2">
            <Label>M3U / M3U8 File (max 40MB)</Label>
            <Input
              type="file"
              accept=".m3u,.m3u8,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="cursor-pointer"
            />
          </div>
          <div className="grid gap-2">
            <Label>Name (optional)</Label>
            <Input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="My Playlist" />
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500"
            disabled={uploadFile.isPending || !file}
            onClick={() => uploadFile.mutate()}
          >
            <FileUp className="mr-1 h-4 w-4" />
            {uploadFile.isPending ? "Uploading…" : "Upload File"}
          </Button>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

function BulkImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<BulkPreview | null>(null);

  const previewMut = useMutation({
    mutationFn: () => bulkPreviewPortals(text),
    onSuccess: (data) => setPreview(data),
    onError: (error: Error) => {
      setPreview(null);
      toast.error(error.message);
    },
  });

  const importMut = useMutation({
    mutationFn: () => bulkImportPortals(text),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success(
        `${data.created} sources import ho gaye, ${data.duplicatesSkipped} duplicate skip (Stalker ${data.byType.stalker} • Xtream ${data.byType.xtream} • M3U ${data.byType.m3u}) — ab 'Sync Pending' dabao`,
        { duration: 8000 },
      );
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const readFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("File 2MB se badi hai — chhoti file ya paste use karo");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setPreview(null);
      toast.success(`"${file.name}" padh liya — ab Preview dabao`);
    };
    reader.readAsText(file);
  };

  const reset = () => {
    setText("");
    setPreview(null);
  };

  const fresh = preview?.entries.filter((e) => !e.duplicate).length ?? 0;

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto bg-zinc-950 sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" /> Bulk Import
        </DialogTitle>
        <DialogDescription>
          Poora text paste karo (portal + MAC list, get.php links, expiry dates — koi bhi format) ya .txt file upload karo.
          System sab khud detect karega.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Credentials dump (text)</Label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300">
              <FileUp className="h-3.5 w-3.5" />
              .txt file se padho
              <input
                type="file"
                accept=".txt,.m3u,.m3u8,.log"
                className="hidden"
                onChange={(e) => {
                  readFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            placeholder={`http://panel.example.com/c/
00:1A:79:31:60:57   April 1, 2026
00:1A:79:64:82:69   12.01.2027

http://host.tv:8080/get.php?username=abc&password=xyz&type=m3u_plus&output=ts
📆 Expired on : 7/30/2027 9:54:42 AM`}
            className="h-52 w-full resize-y rounded-md border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {text.length > 0 && (
            <p className="text-xs text-zinc-500">{text.split(/\r?\n/).length} lines • {(text.length / 1024).toFixed(1)} KB</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-emerald-600 hover:bg-emerald-500"
            disabled={previewMut.isPending || text.trim().length < 8}
            onClick={() => previewMut.mutate()}
          >
            <ClipboardPaste className="mr-1 h-4 w-4" />
            {previewMut.isPending ? "Parsing…" : "Preview"}
          </Button>
          {preview && (
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={reset}
              disabled={importMut.isPending}
            >
              Clear
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="Total" value={preview.stats.total} tone="text-zinc-100" />
              <Stat label="Stalker" value={preview.stats.stalker} tone="text-emerald-400" />
              <Stat label="Xtream" value={preview.stats.xtream} tone="text-amber-400" />
              <Stat label="M3U" value={preview.stats.m3u} tone="text-sky-400" />
              <Stat label="Duplicate" value={preview.stats.duplicates} tone="text-orange-400" />
              <Stat label="Skipped" value={preview.skippedLines} tone="text-zinc-500" />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="sticky top-0 bg-zinc-900">Type</TableHead>
                    <TableHead className="sticky top-0 bg-zinc-900">Source</TableHead>
                    <TableHead className="sticky top-0 bg-zinc-900">MAC / User</TableHead>
                    <TableHead className="sticky top-0 bg-zinc-900">Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.entries.slice(0, 200).map((e, i) => (
                    <TableRow key={i} className={`border-zinc-800 ${e.duplicate ? "opacity-50" : ""}`}>
                      <TableCell>
                        <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                          {PORTAL_TYPE_LABEL[e.type] ?? e.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium text-zinc-200">{e.name}</div>
                        {e.url && <div className="max-w-52 truncate text-[10px] text-zinc-500">{e.url}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-zinc-400">{e.macAddress ?? e.username ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {e.expiresAt ? (
                          <span className="text-zinc-300">{fmtDate(e.expiresAt).split(",")[0]}</span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                        {e.duplicate && <Badge className="ml-1 bg-orange-500/15 text-orange-400">already hai</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.entries.length > 200 && (
              <p className="text-xs text-zinc-500">+ {preview.entries.length - 200} aur entries…</p>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-500"
          disabled={!preview || fresh === 0 || importMut.isPending}
          onClick={() => importMut.mutate()}
        >
          {importMut.isPending ? "Importing…" : `Import ${fresh} new sources`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/70 p-2 text-center">
      <div className={`text-lg font-bold ${tone}`}>{fmtNumber(value)}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

function LogsDialog({ portal, onClose }: { portal: AdminPortal; onClose: () => void }) {
  const logsQuery = useQuery({
    queryKey: ["portal-logs", portal.id],
    queryFn: () => fetchPortalLogs(portal.id),
    refetchInterval: 15_000,
  });
  const logs: SyncLogItem[] = logsQuery.data?.items ?? [];

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto bg-zinc-950 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Sync Logs — {portal.name}</DialogTitle>
        <DialogDescription>Last 20 sync attempts (new/removed/updated channels).</DialogDescription>
      </DialogHeader>
      <div className="max-h-96 space-y-2 overflow-y-auto py-2">
        {logs.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Abhi koi sync nahi hua.</p>}
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
            <div className="flex items-center justify-between">
              <StatusBadge status={log.status} />
              <span className="text-xs text-zinc-500">{fmtDate(log.startedAt)}</span>
            </div>
            {log.message && <p className="mt-1 text-xs text-zinc-400">{log.message}</p>}
            {log.status === "SUCCESS" && (
              <p className="mt-1 text-xs">
                <span className="text-emerald-400">+{log.added} new</span>{" "}
                <span className="text-sky-400">~{log.updated} updated</span>{" "}
                <span className="text-red-400">-{log.removed} removed</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </DialogContent>
  );
}

export function PortalsSection() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [logsFor, setLogsFor] = useState<AdminPortal | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [bulkSync, setBulkSync] = useState<{ done: number; total: number; ok: number; failed: number } | null>(null);
  const cancelBulkRef = useRef(false);

  const portalsQuery = useQuery({
    queryKey: ["admin-portals"],
    queryFn: fetchAdminPortals,
    refetchInterval: 20_000,
  });

  const sync = useMutation({
    mutationFn: (id: string) => syncAdminPortal(id),
    onSuccess: (result) => {
      toast.success(`Sync done ✅ ${result.added} new, ${result.updated} updated, ${result.removed} removed (${(result.durationMs / 1000).toFixed(1)}s)`);
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-meta"] });
      setSyncingId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setSyncingId(null);
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateAdminPortal(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteAdminPortal(id),
    onSuccess: () => {
      toast.success("Portal delete ho gaya (uske channels bhi)");
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-meta"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = portalsQuery.data?.items ?? [];
  const filtered = statusFilter === "ALL" ? items : items.filter((p) => p.status === statusFilter);
  const pendingCount = items.filter((p) => p.status === "PENDING").length;

  const runBulkSync = async () => {
    const queue = items.filter((p) => p.status === "PENDING");
    if (queue.length === 0) return;
    cancelBulkRef.current = false;
    setBulkSync({ done: 0, total: queue.length, ok: 0, failed: 0 });
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < queue.length; i++) {
      if (cancelBulkRef.current) break;
      try {
        await syncAdminPortal(queue[i].id);
        ok++;
      } catch {
        failed++;
      }
      setBulkSync({ done: i + 1, total: queue.length, ok, failed });
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
    }
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["admin-meta"] });
    toast.success(
      cancelBulkRef.current
        ? `Bulk sync roka — ${ok} safe, ${failed} fail (baaki pending raha)`
        : `Bulk sync done — ${ok} safe, ${failed} fail`,
      { duration: 8000 },
    );
    setBulkSync(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          iptv-org band ho jaye to yahan apne sources daalo — Stalker MAC, Xtream, M3U link/file. Sab kuch yahin se chalega.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-amber-600/50 text-amber-400 hover:bg-amber-500/10" onClick={() => setBulkOpen(true)}>
            <Zap className="mr-1 h-4 w-4" /> Bulk Import
          </Button>
          {bulkSync ? (
            <>
              <Button variant="outline" className="border-zinc-700" disabled>
                <RefreshCw className="mr-1 h-4 w-4 animate-spin text-emerald-400" />
                Syncing {bulkSync.done}/{bulkSync.total} ({bulkSync.ok} ✓ {bulkSync.failed} ✗)
              </Button>
              <Button
                variant="outline"
                className="border-red-800 text-red-400 hover:bg-red-500/10"
                onClick={() => {
                  cancelBulkRef.current = true;
                }}
              >
                <Square className="mr-1 h-3.5 w-3.5" /> Stop
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              className="border-emerald-700 text-emerald-400 hover:bg-emerald-500/10"
              disabled={pendingCount === 0}
              onClick={() => void runBulkSync()}
            >
              <RefreshCw className="mr-1 h-4 w-4" /> Sync Pending ({pendingCount})
            </Button>
          )}
          <ValiditySweepButton />
          <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-500">
            <Plus className="mr-1 h-4 w-4" /> Add Source
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["ALL", "PENDING", "ACTIVE", "ERROR", "SYNCING", "INACTIVE", "EXPIRED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-emerald-600 text-white"
                : "border border-zinc-800 text-zinc-400 hover:bg-zinc-800/60"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            {s !== "ALL" && (
              <span className="ml-1 text-[10px] opacity-70">{items.filter((p) => p.status === s).length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead>Source</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Credentials</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Sync</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {portalsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-zinc-500">Load ho raha hai…</TableCell>
              </TableRow>
            )}
            {!portalsQuery.isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-zinc-500">
                  {statusFilter === "ALL"
                    ? "Koi source nahi. Pehla Stalker/Xtream/M3U add karo ya Bulk Import use karo. 📡"
                    : `Is status mein koi source nahi (${statusFilter}).`}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((portal) => {
              const left = daysLeft(portal.expiresAt);
              return (
                <TableRow key={portal.id} className="border-zinc-800">
                  <TableCell>
                    <div className="font-medium text-zinc-100">{portal.name}</div>
                    {portal.url && (
                      <div className="max-w-44 truncate text-xs text-zinc-500">{portal.url}</div>
                    )}
                    {portal.notes && <div className="text-xs text-zinc-600">{portal.notes}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="border-zinc-700 text-zinc-300">{PORTAL_TYPE_LABEL[portal.type] ?? portal.type}</Badge></TableCell>
                  <TableCell>
                    {portal.type === "STALKER" && (
                      <div className="font-mono text-xs text-zinc-400">
                        <div>📱 {portal.macAddress}</div>
                      </div>
                    )}
                    {portal.type === "XTREAM" && (
                      <div className="font-mono text-xs text-zinc-400">
                        <div>👤 {portal.username}</div>
                        <div>🔒 ••••••</div>
                      </div>
                    )}
                    {portal.type === "M3U_URL" && <span className="text-xs text-zinc-500">🔗 link</span>}
                    {portal.type === "M3U_FILE" && <span className="text-xs text-zinc-500">📁 file</span>}
                  </TableCell>
                  <TableCell className="font-semibold">{fmtNumber(portal.channelCount)}</TableCell>
                  <TableCell>
                    {portal.expiresAt ? (
                      <div>
                        <div className="text-sm">{fmtDate(portal.expiresAt).split(",")[0]}</div>
                        <div className={`text-xs ${left !== null && left < 7 ? "text-orange-400" : "text-zinc-500"}`}>
                          {left !== null && left >= 0 ? `${left} din bache` : "expired"}
                        </div>
                      </div>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-zinc-500"><Clock className="h-3 w-3" /> —</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <StatusBadge status={portal.status} />
                      {portal.lastError && (
                        <p className="max-w-40 truncate text-xs text-red-400" title={portal.lastError}>
                          {portal.lastError}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{fmtDate(portal.lastSyncedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Sync Now"
                        disabled={syncingId === portal.id || sync.isPending}
                        onClick={() => { setSyncingId(portal.id); sync.mutate(portal.id); }}
                      >
                        <RefreshCw className={`h-4 w-4 text-emerald-400 ${syncingId === portal.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button size="sm" variant="ghost" title="Sync history" onClick={() => setLogsFor(portal)}>
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={portal.isActive ? "Deactivate" : "Activate"}
                        onClick={() => toggleActive.mutate({ id: portal.id, isActive: !portal.isActive })}
                      >
                        <Power className={`h-4 w-4 ${portal.isActive ? "text-orange-400" : "text-emerald-400"}`} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete"
                        onClick={() => {
                          if (confirm(`${portal.name} + uske ${portal.channelCount} channels delete karein?`)) {
                            del.mutate(portal.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <AddPortalDialog open={addOpen} onClose={() => setAddOpen(false)} />
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <BulkImportDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
      </Dialog>

      <Dialog open={logsFor !== null} onOpenChange={(open) => !open && setLogsFor(null)}>
        {logsFor && <LogsDialog portal={logsFor} onClose={() => setLogsFor(null)} />}
      </Dialog>
    </div>
  );
}

/** One-click validity sweep: flags every source whose expiry date has passed. */
function ValiditySweepButton() {
  const queryClient = useQueryClient();
  const sweep = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/portals/sweep", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sweep fail");
      return data as { swept: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-portals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success(
        data.swept > 0
          ? `${data.swept} source EXPIRED mark hue — unke channels ab kisi ko nahi dikhenge`
          : "Sab sources valid hain — koi expired nahi mila",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button
      variant="outline"
      className="border-red-900/60 text-red-400 hover:bg-red-500/10"
      disabled={sweep.isPending}
      onClick={() => sweep.mutate()}
      title="Expired validity wale sources ko EXPIRED mark karo"
    >
      <ShieldCheck className={sweep.isPending ? "mr-1 h-4 w-4 animate-pulse" : "mr-1 h-4 w-4"} />
      {sweep.isPending ? "Checking…" : "Validity Check"}
    </Button>
  );
}
