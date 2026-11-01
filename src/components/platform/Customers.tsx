"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, withQuery, type CustomerRow, type Paged } from "./api";
import { useRoute } from "./router";
import { emptySubDraft, subDraftBody, SubscriptionFields, type SubDraft } from "./SubscriptionDialogs";
import {
  Chips,
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
  StatePill,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  useDebounced,
  usePlans,
} from "./ui";

const STATE_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING", label: "Expiring soon" },
  { value: "EXPIRED", label: "Expired" },
  { value: "PENDING", label: "Pending" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "NO_SUBSCRIPTION", label: "No subscription" },
  { value: "ARCHIVED", label: "Archived" },
];

export function CustomersSection() {
  const { route, setQuery } = useRoute();
  const [addOpen, setAddOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Customers"
        description="Every customer, their subscription and devices."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Add customer
          </Button>
        }
      />
      <CustomersTable
        filters={{
          search: route.query.q ?? "",
          state: route.query.state ?? "ALL",
          org: route.query.org ?? "",
          plan: route.query.plan ?? "",
          page: Number(route.query.page ?? 1),
        }}
        onFilters={(f) => setQuery({ q: f.search, state: f.state, org: f.org, plan: f.plan, page: f.page > 1 ? String(f.page) : undefined })}
        onAdd={() => setAddOpen(true)}
      />
      {addOpen && <AddCustomerDialog presetOrgId={route.query.org ?? ""} onClose={() => setAddOpen(false)} />}
    </>
  );
}

export interface CustomerFilters {
  search: string;
  state: string;
  org: string;
  plan: string;
  page: number;
}

/** Customer list; `fixedOrgId` embeds it in an organization page. */
export function CustomersTable({
  filters,
  onFilters,
  fixedOrgId,
  onAdd,
}: {
  filters: CustomerFilters;
  onFilters: (filters: CustomerFilters) => void;
  fixedOrgId?: string;
  onAdd?: () => void;
}) {
  const { go } = useRoute();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const search = useDebounced(searchDraft, 350);
  const orgId = fixedOrgId ?? filters.org;
  const plans = usePlans(orgId || undefined);

  if (search !== filters.search) onFilters({ ...filters, search, page: 1 });

  const query = useQuery({
    queryKey: ["platform", "customers", orgId, filters.state, filters.plan, filters.search, filters.page],
    queryFn: () =>
      api<Paged<CustomerRow>>(
        withQuery("/api/platform/customers", {
          organizationId: orgId,
          state: filters.state,
          planId: filters.plan,
          search: filters.search,
          page: filters.page,
        })
      ),
    placeholderData: keepPreviousData,
  });

  const set = (patch: Partial<CustomerFilters>) => onFilters({ ...filters, ...patch, page: patch.page ?? 1 });
  const hasFilters = filters.state !== "ALL" || !!filters.search || !!filters.plan || (!fixedOrgId && !!filters.org);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            className={`${inputCls} pl-9`}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search name, email, mobile, username or customer ID"
            aria-label="Search customers"
          />
        </div>
        {!fixedOrgId && <OrgSelect value={filters.org} onChange={(v) => set({ org: v === "ALL" ? "" : v, plan: "" })} />}
        <Select value={filters.plan || "ALL"} onValueChange={(v) => set({ plan: v === "ALL" ? "" : v })}>
          <SelectTrigger className="h-9 min-w-[10rem] border-zinc-700 bg-zinc-950" aria-label="Plan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All plans</SelectItem>
            {(plans.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {!orgId ? ` · ${p.organization.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Chips label="Subscription status" options={STATE_OPTIONS} value={filters.state} onChange={(v) => set({ state: v })} />

      {query.isError && <ErrorBox error={query.error} onRetry={() => query.refetch()} />}
      {query.isLoading ? (
        <TableSkeleton cols={7} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-zinc-800">
          <EmptyState
            icon={Users}
            title={hasFilters ? "No customers match these filters" : "No customers yet"}
            message={hasFilters ? "Try another status or clear the search." : "Add the first customer and give them a subscription."}
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchDraft("");
                    onFilters({ search: "", state: "ALL", org: fixedOrgId ? filters.org : "", plan: "", page: 1 });
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                onAdd && (
                  <Button onClick={onAdd}>
                    <UserPlus className="mr-1.5 h-4 w-4" /> Add customer
                  </Button>
                )
              )
            }
          />
        </div>
      ) : (
        <>
          <TableShell minWidth={900}>
            <thead>
              <tr>
                <Th>Customer</Th>
                {!fixedOrgId && <Th>Organization</Th>}
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Valid until</Th>
                <Th className="text-right">Devices</Th>
                <Th>Last login</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer hover:bg-zinc-900/60"
                  onClick={() => go("customers", { id: c.id })}
                >
                  <Td>
                    <div className="font-medium text-zinc-100">{c.name}</div>
                    <div className="text-xs text-zinc-500">
                      @{c.username} · {c.email}
                    </div>
                  </Td>
                  {!fixedOrgId && <Td className="text-zinc-300">{c.organization.name}</Td>}
                  <Td className="text-zinc-300">{c.plan?.name ?? <span className="text-zinc-500">—</span>}</Td>
                  <Td>
                    <StatePill value={c.state} />
                  </Td>
                  <Td>
                    <div className="text-zinc-300">{fmtDate(c.planExpiresAt)}</div>
                    {c.planExpiresAt && c.state !== "ARCHIVED" && (
                      <div className="text-xs">
                        <DaysLeft days={c.daysLeft} />
                      </div>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-300">
                    {c.devices}
                    {c.plan ? <span className="text-zinc-500"> / {c.plan.maxDevices}</span> : null}
                  </Td>
                  <Td className="text-xs text-zinc-400">{c.lastLoginAt ? fmtDateTime(c.lastLoginAt) : "Never"}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        go("customers", { id: c.id });
                      }}
                    >
                      View
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          {query.data && <Pager page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPage={(page) => set({ page })} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------ add customer ------------------------------ */

export function AddCustomerDialog({ presetOrgId, onClose }: { presetOrgId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { go } = useRoute();
  const [orgId, setOrgId] = useState(presetOrgId ?? "");
  const [form, setForm] = useState({ name: "", mobile: "", email: "", username: "", password: "", confirm: "" });
  const [withSubscription, setWithSubscription] = useState(true);
  const [draft, setDraft] = useState<SubDraft>(emptySubDraft);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const validate = (): string | null => {
    if (!orgId) return "Choose an organization.";
    if (!form.name.trim()) return "Full name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!form.username.trim()) return "Username is required.";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    if (form.password !== form.confirm) return "Passwords don't match.";
    if (withSubscription && !draft.planId) return "Choose a plan, or switch to “No subscription”.";
    return null;
  };

  const save = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/platform/customers", {
        method: "POST",
        body: {
          organizationId: orgId,
          customer: {
            name: form.name,
            mobile: form.mobile || undefined,
            email: form.email,
            username: form.username,
            password: form.password,
          },
          subscription: withSubscription ? subDraftBody(draft) : null,
        },
      }),
    onSuccess: (res) => {
      toast.success(withSubscription ? "Customer added with a subscription" : "Customer added — no active subscription yet");
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      onClose();
      go("customers", { id: res.id });
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    const problem = validate();
    setError(problem);
    if (!problem) save.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-zinc-800 bg-zinc-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Add customer</DialogTitle>
          <DialogDescription className="text-zinc-400">Create the login, choose the organization, and optionally start a subscription.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold text-zinc-200">Organization</legend>
            <OrgSelect id="add-org" value={orgId} onChange={(v) => { setOrgId(v); setDraft(emptySubDraft()); }} allowAll={false} className="w-full" />
          </fieldset>

          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-zinc-200 sm:col-span-2">Personal information</legend>
            <Field label="Full name" htmlFor="add-name">
              <input id="add-name" className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Mobile number" htmlFor="add-mobile">
              <input id="add-mobile" className={inputCls} value={form.mobile} onChange={(e) => set("mobile", e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Email" htmlFor="add-email">
              <input id="add-email" type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Username (login ID)" htmlFor="add-username" hint="3–40 letters, numbers, . _ -">
              <input id="add-username" className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} autoComplete="off" />
            </Field>
            <Field label="Password" htmlFor="add-password">
              <input id="add-password" type="password" className={inputCls} value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Confirm password" htmlFor="add-confirm">
              <input id="add-confirm" type="password" className={inputCls} value={form.confirm} onChange={(e) => set("confirm", e.target.value)} autoComplete="new-password" />
            </Field>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold text-zinc-200">Subscription</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Subscription">
              <Button type="button" size="sm" variant={withSubscription ? "default" : "outline"} aria-pressed={withSubscription} onClick={() => setWithSubscription(true)}>
                Create subscription now
              </Button>
              <Button type="button" size="sm" variant={!withSubscription ? "default" : "outline"} aria-pressed={!withSubscription} onClick={() => setWithSubscription(false)}>
                No subscription
              </Button>
            </div>
            {withSubscription ? (
              <SubscriptionFields organizationId={orgId} draft={draft} onChange={setDraft} idPrefix="add-sub" />
            ) : (
              <p className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
                The customer can log in but has <b className="text-zinc-200">no active subscription</b> — no paid channels until you create one.
              </p>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Add customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
