"use client";

/* Admin: Channels section — server-side paginated table with all filters + bulk actions. */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Pencil, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  bulkAdminChannels,
  fetchAdminChannels,
  fetchAdminMeta,
  fetchAdminPortals,
  updateAdminChannel,
  type AdminChannel,
} from "@/lib/admin-api";
import { MultiSelect, fmtNumber } from "./shared";

function EditChannelDialog({
  channel,
  onClose,
}: {
  channel: AdminChannel;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(channel.name);
  const [categories, setCategories] = useState<string[]>(channel.categories);
  const [languages, setLanguages] = useState<string[]>(channel.languages);
  const [isDemo, setIsDemo] = useState(channel.isDemo);

  const save = useMutation({
    mutationFn: () => updateAdminChannel(channel.id, { name, categories, languages, isDemo }),
    onSuccess: () => {
      toast.success("Channel metadata save ho gaya");
      queryClient.invalidateQueries({ queryKey: ["admin-channels"] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogContent className="bg-zinc-950 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Channel Metadata</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 py-2">
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Categories (comma separated)</Label>
          <Input
            value={categories.join(", ")}
            onChange={(e) => setCategories(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="news, sports"
          />
        </div>
        <div className="grid gap-2">
          <Label>Languages (comma separated)</Label>
          <Input
            value={languages.join(", ")}
            onChange={(e) => setLanguages(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="Hindi, English"
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium text-zinc-200">Demo channel</span>
            <span className="block text-xs text-zinc-500">
              ON karne par ye channel bina plan ke bhi chalega (home showcase)
            </span>
          </span>
          <Switch checked={isDemo} onCheckedChange={setIsDemo} aria-label="Demo channel" />
        </label>
        <p className="text-xs text-zinc-500">Source ID: {channel.sourceId}</p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function ChannelsSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [portalId, setPortalId] = useState("all");
  const [adult, setAdult] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminChannel | null>(null);

  const metaQuery = useQuery({ queryKey: ["admin-meta"], queryFn: fetchAdminMeta });
  const portalsQuery = useQuery({ queryKey: ["admin-portals"], queryFn: fetchAdminPortals });

  const channelsQuery = useQuery({
    queryKey: ["admin-channels", search, regions, countries, languages, categories, portalId, adult, status, page],
    queryFn: () =>
      fetchAdminChannels({
        search,
        region: regions.join(","),
        country: countries.join(","),
        language: languages.join(","),
        category: categories.join(","),
        portalId: portalId === "all" ? undefined : portalId,
        adult,
        status,
        page,
        pageSize: 25,
      }),
  });

  const bulk = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: "activate" | "deactivate" | "delete" }) =>
      bulkAdminChannels(ids, action),
    onSuccess: (result) => {
      toast.success(`${result.affected} channels pe action ho gaya`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["admin-channels"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAdminChannel(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-channels"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = channelsQuery.data?.items ?? [];
  const total = channelsQuery.data?.total ?? 0;
  const totalPages = channelsQuery.data?.totalPages ?? 1;
  const meta = metaQuery.data;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(new Set(items.map((i) => i.id)));
  const clearSelection = () => setSelected(new Set());

  const applySearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput(""); setSearch("");
    setRegions([]); setCountries([]); setLanguages([]); setCategories([]);
    setPortalId("all"); setAdult("all"); setStatus("all"); setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filter panel */}
      <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="Channel name ya ID…"
              className="pl-9"
            />
          </div>
          <Button variant="secondary" onClick={applySearch}>Search</Button>
          <MultiSelect
            placeholder="Region"
            options={(meta?.regions ?? []).map((r) => ({ value: r, label: r }))}
            selected={regions}
            onChange={(v) => { setRegions(v); setPage(1); }}
          />
          <MultiSelect
            placeholder="Country"
            options={(meta?.countries ?? []).map((c) => ({ value: c.code, label: c.name }))}
            selected={countries}
            onChange={(v) => { setCountries(v); setPage(1); }}
          />
          <MultiSelect
            placeholder="Language"
            options={(meta?.languages ?? []).map((l) => ({ value: l, label: l }))}
            selected={languages}
            onChange={(v) => { setLanguages(v); setPage(1); }}
          />
          <MultiSelect
            placeholder="Category"
            options={(meta?.categories ?? []).map((c) => ({ value: c, label: c }))}
            selected={categories}
            onChange={(v) => { setCategories(v); setPage(1); }}
          />
          <Select value={portalId} onValueChange={(v) => { setPortalId(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950">
              <SelectItem value="all">All Portals</SelectItem>
              <SelectItem value="__builtin__">Built-in (iptv-org)</SelectItem>
              {(portalsQuery.data?.items ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={adult} onValueChange={(v) => { setAdult(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950">
              <SelectItem value="all">Adult: All</SelectItem>
              <SelectItem value="included">Adult: Only</SelectItem>
              <SelectItem value="excluded">Adult: Excluded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950">
              <SelectItem value="all">Status: All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={clearFilters}>Clear Filters</Button>
        </div>
        <p className="text-xs text-zinc-500">
          {fmtNumber(total)} channels match (server-side paginated — 10k+ pe bhi fast)
        </p>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-sm">
          <span className="font-medium text-amber-300">{selected.size} selected</span>
          <Button size="sm" variant="outline" onClick={selectAllVisible}>Select All (page)</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>Deselect All</Button>
          <div className="flex-1" />
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => bulk.mutate({ ids: [...selected], action: "activate" })}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Activate
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate({ ids: [...selected], action: "deactivate" })}>
            <Ban className="mr-1 h-3.5 w-3.5" /> Deactivate
          </Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm(`${selected.size} channels delete karein?`)) bulk.mutate({ ids: [...selected], action: "delete" }); }}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="w-10" />
              <TableHead>Channel</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Adult</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channelsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-zinc-500">Load ho raha hai…</TableCell>
              </TableRow>
            )}
            {!channelsQuery.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-zinc-500">Koi channel match nahi hua.</TableCell>
              </TableRow>
            )}
            {items.map((channel) => (
              <TableRow key={channel.id} className="border-zinc-800">
                <TableCell>
                  <Checkbox checked={selected.has(channel.id)} onCheckedChange={() => toggleSelect(channel.id)} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {channel.logo ? (
                      <img src={channel.logo} alt="" className="h-8 w-8 rounded bg-zinc-800 object-contain p-0.5" loading="lazy" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-xs">📺</div>
                    )}
                    <div className="max-w-52">
                      <div className="truncate font-medium text-zinc-100">
                        {channel.name}
                        {channel.isDemo && (
                          <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 align-middle text-[9px] font-bold text-amber-400">
                            DEMO
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {channel.countryName ?? "—"} • {channel.streamCount} stream{channel.streamCount === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-zinc-400">{channel.portal?.name ?? "Built-in"}</span>
                </TableCell>
                <TableCell className="text-xs text-zinc-400">{channel.region ?? "—"}</TableCell>
                <TableCell className="max-w-28 truncate text-xs text-zinc-400">{channel.languages.join(", ") || "—"}</TableCell>
                <TableCell className="max-w-28 truncate text-xs text-zinc-400">{channel.categories.join(", ") || "—"}</TableCell>
                <TableCell>{channel.isNsfw ? <span className="text-purple-400">18+</span> : <span className="text-zinc-600">—</span>}</TableCell>
                <TableCell>
                  <span className={channel.isActive ? "text-emerald-400" : "text-zinc-500"}>
                    {channel.isActive ? "● Active" : "○ Inactive"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title={channel.isActive ? "Deactivate" : "Activate"}
                      onClick={() => toggle.mutate({ id: channel.id, isActive: !channel.isActive })}
                    >
                      {channel.isActive ? (
                        <Ban className="h-4 w-4 text-orange-400" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      )}
                    </Button>
                    <Button size="sm" variant="ghost" title="Edit" onClick={() => setEditing(channel)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-zinc-500">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && <EditChannelDialog channel={editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
