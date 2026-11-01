"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Plus, Search, Tv, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, withQuery, type ChannelPick, type Facets, type PlanDetail, type PlanRow } from "./api";
import { Field, inputCls, money, OrgSelect, Panel, SearchMultiSelect, TableSkeleton, useDebounced } from "./ui";

const VALIDITY_PRESETS = [7, 14, 30, 90, 180, 365];

interface SelectedChannel {
  id: string;
  name: string;
}

export function PlanBuilder({ plan, presetOrgId, lockOrg = false, onClose }: { plan: PlanRow | null; presetOrgId?: string; lockOrg?: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState(plan?.organizationId ?? presetOrgId ?? "");
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price: String(plan?.price ?? 0),
    durationDays: String(plan?.durationDays ?? 30),
    maxDevices: String(plan?.maxDevices ?? 1),
    allowAdult: plan?.allowAdult ?? false,
    isActive: plan?.isActive ?? true,
  });
  const [categories, setCategories] = useState<string[]>(plan?.categories ?? []);
  const [languages, setLanguages] = useState<string[]>(plan?.languages ?? []);
  const [countries, setCountries] = useState<string[]>(plan?.countries ?? []);
  const [regions, setRegions] = useState<string[]>(plan?.regions ?? []);
  const [channels, setChannels] = useState<SelectedChannel[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  // editing: load the plan's explicit channels (+ confirm rules)
  const detail = useQuery({
    queryKey: ["platform", "plan-detail", plan?.id],
    queryFn: () => api<PlanDetail>(`/api/platform/plans/${plan!.id}`),
    enabled: !!plan,
  });
  // apply the loaded plan once, via the render-time adjustment pattern (no effect)
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (detail.data && loadedId !== detail.data.id) {
    setLoadedId(detail.data.id);
    setChannels(detail.data.channels.map((c) => ({ id: c.id, name: c.name })));
    setCategories(detail.data.categories);
    setLanguages(detail.data.languages);
    setCountries(detail.data.countries);
    setRegions(detail.data.regions);
  }

  const facets = useQuery({
    queryKey: ["platform", "facets", orgId],
    queryFn: () => api<Facets>(`/api/platform/orgs/${orgId}/facets`),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // live "this plan will include N channels" preview
  const previewBody = useMemo(
    () => ({ organizationId: orgId, regions, countries, languages, categories, allowAdult: form.allowAdult, channelIds: channels.map((c) => c.id) }),
    [orgId, regions, countries, languages, categories, form.allowAdult, channels]
  );
  const debouncedPreview = useDebounced(previewBody, 400);
  const preview = useQuery({
    queryKey: ["platform", "plan-preview", debouncedPreview],
    queryFn: () => api<{ total: number; sample: string[] }>("/api/platform/plans/preview", { method: "POST", body: debouncedPreview }),
    enabled: !!orgId,
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        description: form.description || null,
        price: Number(form.price),
        durationDays: Number(form.durationDays),
        maxDevices: Number(form.maxDevices),
        allowAdult: form.allowAdult,
        isActive: form.isActive,
        categories,
        languages,
        countries,
        regions,
        channelIds: channels.map((c) => c.id),
      };
      return plan
        ? api(`/api/platform/plans/${plan.id}`, { method: "PATCH", body })
        : api("/api/platform/plans", { method: "POST", body: { ...body, organizationId: orgId } });
    },
    onSuccess: () => {
      toast.success(plan ? "Plan updated" : "Plan created");
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!orgId) return setError("Choose an organization.");
    if (!form.name.trim()) return setError("Enter a plan name.");
    if (!(Number(form.durationDays) >= 1)) return setError("Validity must be at least 1 day.");
    if (!(Number(form.maxDevices) >= 1)) return setError("Device limit must be at least 1.");
    save.mutate();
  };

  const noRules = categories.length === 0 && languages.length === 0 && countries.length === 0 && regions.length === 0;
  const activeSubs = plan?.activeSubscriptions ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-h-[94vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="text-white">{plan ? `Edit ${plan.name}` : "Create plan"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Pick channel access from real dropdowns — no typing lists. Price changes apply to new subscriptions and renewals, not running ones.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[74vh] grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1fr_20rem]">
          {/* left: configuration */}
          <div className="thin-scrollbar space-y-5 overflow-y-auto p-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200">Plan details</h3>
              {!lockOrg && (
                <Field label="Organization" htmlFor="pb-org">
                  <OrgSelect id="pb-org" value={orgId} onChange={(v) => { setOrgId(v); setCategories([]); setLanguages([]); setCountries([]); setRegions([]); setChannels([]); }} allowAll={false} className="w-full" />
                </Field>
              )}
              <Field label="Plan name" htmlFor="pb-name">
                <input id="pb-name" className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Premium" />
              </Field>
              <Field label="Description / features" htmlFor="pb-desc">
                <textarea id="pb-desc" rows={2} className={`${inputCls} h-auto py-2`} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Price (₹)" htmlFor="pb-price">
                  <input id="pb-price" type="number" min={0} className={inputCls} value={form.price} onChange={(e) => set("price", e.target.value)} />
                </Field>
                <Field label="Device limit" htmlFor="pb-devices">
                  <input id="pb-devices" type="number" min={1} max={50} className={inputCls} value={form.maxDevices} onChange={(e) => set("maxDevices", e.target.value)} />
                </Field>
                <Field label="Validity (days)" htmlFor="pb-days">
                  <input id="pb-days" type="number" min={1} className={inputCls} value={form.durationDays} onChange={(e) => set("durationDays", e.target.value)} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VALIDITY_PRESETS.map((d) => (
                  <button key={d} type="button" onClick={() => set("durationDays", String(d))} className={`rounded-full border px-3 py-1 text-xs ${Number(form.durationDays) === d ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}>
                    {d === 365 ? "1 year" : d === 30 ? "1 month" : `${d} days`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm text-zinc-300"><Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} /> Active</label>
                <label className="flex items-center gap-2 text-sm text-zinc-300"><Switch checked={form.allowAdult} onCheckedChange={(v) => set("allowAdult", v)} /> Allow 18+ content</label>
              </div>
            </section>

            <section className="space-y-3 border-t border-zinc-800 pt-4">
              <h3 className="text-sm font-semibold text-zinc-200">Channel access</h3>
              {!orgId ? (
                <p className="text-sm text-zinc-500">Choose an organization to load its categories, languages and channels.</p>
              ) : facets.isLoading ? (
                <p className="text-sm text-zinc-500">Loading options…</p>
              ) : facets.isError ? (
                <p className="text-sm text-red-300">Couldn&apos;t load options. <button className="underline" onClick={() => facets.refetch()}>Retry</button></p>
              ) : (
                <>
                  <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
                    Leave every dropdown empty for <b className="text-zinc-200">all {facets.data?.totalChannels.toLocaleString("en-IN")} channels</b>. Add rules to narrow it, and add specific channels to always include on top.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={`Categories${categories.length ? ` (${categories.length})` : ""}`}>
                      <SearchMultiSelect options={facets.data?.categories ?? []} selected={categories} onChange={setCategories} placeholder="All categories" />
                    </Field>
                    <Field label={`Languages${languages.length ? ` (${languages.length})` : ""}`}>
                      <SearchMultiSelect options={facets.data?.languages ?? []} selected={languages} onChange={setLanguages} placeholder="All languages" />
                    </Field>
                    <Field label={`Countries${countries.length ? ` (${countries.length})` : ""}`}>
                      <SearchMultiSelect options={facets.data?.countries ?? []} selected={countries} onChange={setCountries} placeholder="All countries" />
                    </Field>
                    <Field label={`Regions${regions.length ? ` (${regions.length})` : ""}`}>
                      <SearchMultiSelect options={facets.data?.regions ?? []} selected={regions} onChange={setRegions} placeholder="All regions" />
                    </Field>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-200">Specific channels {channels.length > 0 && <span className="text-zinc-500">({channels.length})</span>}</p>
                      <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> Add channels
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">Always included in this plan, even if the rules above wouldn&apos;t match them.</p>
                    {channels.length > 0 && (
                      <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                        {channels.map((c) => (
                          <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200">
                            {c.name}
                            <button type="button" onClick={() => setChannels((prev) => prev.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`}><X className="h-3 w-3 hover:text-white" /></button>
                          </span>
                        ))}
                        <button type="button" className="text-xs text-zinc-400 hover:underline" onClick={() => setChannels([])}>Clear all</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            {error && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          </div>

          {/* right: live preview */}
          <aside className="thin-scrollbar hidden overflow-y-auto border-l border-zinc-800 bg-zinc-900/30 p-5 lg:block">
            <h3 className="text-sm font-semibold text-zinc-200">Plan preview</h3>
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-lg font-bold text-white">{form.name || "Untitled plan"}</p>
              <p className="mt-1 text-2xl font-extrabold text-white">
                {Number(form.price) === 0 ? "Free" : money(Number(form.price) || 0)}
                <span className="text-sm font-normal text-zinc-400"> / {form.durationDays} days</span>
              </p>
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row k="Devices" v={form.maxDevices} />
                <Row k="Channels (approx.)" v={preview.isFetching ? "…" : (preview.data?.total ?? 0).toLocaleString("en-IN")} strong />
                <Row k="Categories" v={categories.length || "All"} />
                <Row k="Languages" v={languages.length || "All"} />
                <Row k="Countries" v={countries.length || "All"} />
                <Row k="Specific channels" v={channels.length} />
                <Row k="18+ content" v={form.allowAdult ? "Included" : "Blocked"} />
                <Row k="Status" v={form.isActive ? "Active" : "Inactive"} />
              </dl>
            </div>
            {noRules && channels.length === 0 && (
              <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                No rules selected — this plan grants <b>all channels</b>.
              </p>
            )}
            {preview.data && preview.data.sample.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-zinc-400">Sample channels</p>
                <ul className="space-y-1 text-xs text-zinc-400">
                  {preview.data.sample.map((n) => (
                    <li key={n} className="flex items-center gap-1.5"><Tv className="h-3 w-3 text-zinc-600" /> {n}</li>
                  ))}
                </ul>
              </div>
            )}
            {plan && activeSubs > 0 && (
              <p className="mt-3 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
                {activeSubs} active {activeSubs === 1 ? "subscription uses" : "subscriptions use"} this plan. Changes affect what they can watch.
              </p>
            )}
          </aside>
        </div>

        <DialogFooter className="border-t border-zinc-800 px-5 py-3">
          <div className="mr-auto text-sm text-zinc-400 lg:hidden">
            {preview.data ? <>~{preview.data.total.toLocaleString("en-IN")} channels</> : "…"}
          </div>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {plan ? "Save plan" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {pickerOpen && <ChannelPicker organizationId={orgId} selected={channels} onDone={(c) => { setChannels(c); setPickerOpen(false); }} onClose={() => setPickerOpen(false)} facets={facets.data} />}
    </Dialog>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{k}</dt>
      <dd className={strong ? "font-semibold text-white" : "text-zinc-200"}>{v}</dd>
    </div>
  );
}

/* --------------------------- specific channel picker --------------------------- */

function ChannelPicker({
  organizationId,
  selected,
  onDone,
  onClose,
  facets,
}: {
  organizationId: string;
  selected: SelectedChannel[];
  onDone: (channels: SelectedChannel[]) => void;
  onClose: () => void;
  facets?: Facets;
}) {
  const [picked, setPicked] = useState<Map<string, string>>(new Map(selected.map((c) => [c.id, c.name])));
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebounced(searchDraft, 350);
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState("");
  const [country, setCountry] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["platform", "channel-search", organizationId, search, category, language, country, page],
    queryFn: () => api<{ items: ChannelPick[]; total: number; page: number; totalPages: number }>(withQuery("/api/platform/channels", { organizationId, search, category, language, country, page })),
    placeholderData: keepPreviousData,
    enabled: !!organizationId,
  });
  const reset = () => setPage(1);

  const toggle = (c: ChannelPick) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c.name);
      return next;
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden border-zinc-800 bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Add specific channels</DialogTitle>
          <DialogDescription className="text-zinc-400">Search the organization&apos;s channels and tick the ones to always include.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input className={`${inputCls} pl-9`} value={searchDraft} onChange={(e) => { setSearchDraft(e.target.value); reset(); }} placeholder="Search channels by name" aria-label="Search channels" autoFocus />
          </div>
          <div className="flex flex-wrap gap-2">
            <select className={`${inputCls} h-8 w-auto text-sm`} value={category} onChange={(e) => { setCategory(e.target.value); reset(); }} aria-label="Category">
              <option value="">All categories</option>
              {facets?.categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={`${inputCls} h-8 w-auto text-sm`} value={language} onChange={(e) => { setLanguage(e.target.value); reset(); }} aria-label="Language">
              <option value="">All languages</option>
              {facets?.languages.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={`${inputCls} h-8 w-auto text-sm`} value={country} onChange={(e) => { setCountry(e.target.value); reset(); }} aria-label="Country">
              <option value="">All countries</option>
              {facets?.countries.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="thin-scrollbar mt-2 max-h-[42vh] overflow-y-auto rounded-lg border border-zinc-800">
          {query.isLoading ? (
            <div className="p-3"><TableSkeleton rows={6} cols={1} /></div>
          ) : (query.data?.items.length ?? 0) === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">No channels match.</p>
          ) : (
            query.data?.items.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b border-zinc-800/70 px-3 py-2 text-sm hover:bg-zinc-900/60">
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c)} className="h-4 w-4 accent-amber-500" />
                <span className="flex-1 truncate text-zinc-100">
                  {c.name}
                  {c.isNsfw && <span className="ml-2 rounded bg-red-500/15 px-1 text-[10px] text-red-300">18+</span>}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">{c.categories[0] ?? ""}{c.countryName ? ` · ${c.countryName}` : ""}</span>
                {picked.has(c.id) && <Check className="h-4 w-4 text-amber-400" />}
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-zinc-400">
          <span>{picked.size} selected</span>
          {query.data && query.data.totalPages > 1 && (
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              Page {query.data.page}/{query.data.totalPages}
              <Button size="sm" variant="outline" disabled={page >= query.data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </span>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onDone([...picked.entries()].map(([id, name]) => ({ id, name })))}>
            Add {picked.size} channel{picked.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
