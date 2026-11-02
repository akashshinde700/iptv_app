"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, CalendarClock, Crown, Rss, Search, Trash2, Tv, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiFailure, withQuery, type OrgRow } from "./api";
import { AuditTable } from "./Audit";
import { AddCustomerDialog, CustomersTable, type CustomerFilters } from "./Customers";
import { PlansTable } from "./Plans";
import { useRoute } from "./router";
import { ActionConfirm } from "./SubscriptionDialogs";
import { SubscriptionsTable, type SubscriptionFilters } from "./Subscriptions";
import {
  EmptyState,
  ErrorBox,
  Field,
  fmtDate,
  inputCls,
  PageHeader,
  Panel,
  StatePill,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  useDebounced,
} from "./ui";

const STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"];
const PLATFORM_PLANS = ["TRIAL", "STARTER", "PRO", "SCALE"];
const BASE_DOMAIN = process.env.NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN || "streamkaro.app";

export function OrganizationsSection() {
  const { route } = useRoute();
  return route.id ? <OrganizationDetail orgId={route.id} /> : <OrganizationsList />;
}

function OrganizationsList() {
  const { route, setQuery, go } = useRoute();
  const [searchDraft, setSearchDraft] = useState(route.query.q ?? "");
  const search = useDebounced(searchDraft, 300);
  const status = route.query.status ?? "ALL";
  const [remove, setRemove] = useState<OrgRow | null>(null);

  const orgs = useQuery({
    queryKey: ["platform", "orgs", search, status],
    queryFn: () => api<{ items: OrgRow[] }>(withQuery("/api/platform/orgs", { search, status })).then((r) => r.items),
  });

  return (
    <>
      <PageHeader title="Organizations" description="Operators running a StreamKaro storefront. Open one to manage its customers, subscriptions and plans." />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input className={`${inputCls} pl-9`} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search name or slug" aria-label="Search organizations" />
        </div>
        <Select value={status} onValueChange={(v) => setQuery({ status: v })}>
          <SelectTrigger className="h-9 min-w-[10rem] border-zinc-700 bg-zinc-950" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace("_", " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orgs.isError && <ErrorBox error={orgs.error} onRetry={() => orgs.refetch()} />}
      {orgs.isLoading ? (
        <TableSkeleton cols={6} />
      ) : (orgs.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-zinc-800">
          <EmptyState icon={Building2} title="No organizations match" />
        </div>
      ) : (
        <TableShell minWidth={900}>
          <thead>
            <tr>
              <Th sticky>Organization</Th>
              <Th>Status</Th>
              <Th>Platform plan</Th>
              <Th className="text-right">Customers</Th>
              <Th className="text-right">Channels</Th>
              <Th>Valid until</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {(orgs.data ?? []).map((o) => (
              <tr key={o.id} className="hover:bg-zinc-900/60">
                <Td sticky>
                  <button className="text-left" onClick={() => go("organizations", { id: o.id })}>
                    <div className="font-medium text-zinc-100 hover:underline">{o.name}</div>
                    <div className="text-xs text-zinc-500">
                      {o.slug}.{BASE_DOMAIN}
                      {o.customDomain ? ` · ${o.customDomain}` : ""}
                    </div>
                  </button>
                </Td>
                <Td>
                  <OrgStatusSelect org={o} />
                </Td>
                <Td>
                  <OrgPlanSelect org={o} />
                </Td>
                <Td className="text-right tabular-nums">
                  <button className="hover:underline" onClick={() => go("organizations", { id: o.id, query: { tab: "customers" } })}>
                    {o.counts.customers}
                  </button>
                </Td>
                <Td className="text-right tabular-nums text-zinc-400">{o.counts.channels.toLocaleString("en-IN")}</Td>
                <Td className="text-xs text-zinc-400">
                  {o.platformValidUntil ? fmtDate(o.platformValidUntil) : o.platformTrialEndsAt ? `Trial · ${fmtDate(o.platformTrialEndsAt)}` : "—"}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => go("organizations", { id: o.id })}>
                      Manage
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemove(o)} aria-label={`Delete ${o.name}`} className="text-zinc-500 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {remove && (
        <ActionConfirm
          open
          onClose={() => setRemove(null)}
          title={`Delete ${remove.name}?`}
          description={`This permanently deletes ${remove.counts.customers} customers, ${remove.counts.channels.toLocaleString("en-IN")} channels, its portals, plans and history. The root organization can't be deleted.`}
          confirmLabel="Delete organization"
          destructive
          run={() => api(`/api/platform/orgs/${remove.id}`, { method: "DELETE" })}
          success="Organization deleted"
        />
      )}
    </>
  );
}

function useOrgPatch(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/api/platform/orgs/${orgId}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Organization updated");
      queryClient.invalidateQueries({ queryKey: ["platform"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function OrgStatusSelect({ org }: { org: Pick<OrgRow, "id" | "status"> }) {
  const patch = useOrgPatch(org.id);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  return (
    <>
      <Select
        value={org.status}
        disabled={patch.isPending}
        onValueChange={(v) => (v === "SUSPENDED" ? setConfirmSuspend(true) : patch.mutate({ status: v }))}
      >
        <SelectTrigger className="h-8 w-[9rem] border-zinc-700 bg-zinc-950 text-xs" aria-label="Organization status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace("_", " ").toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ActionConfirm
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        title="Suspend this storefront?"
        description="The organization's storefront and apps stop working for all of its customers until you set it active again."
        confirmLabel="Suspend storefront"
        destructive
        run={() => api(`/api/platform/orgs/${org.id}`, { method: "PATCH", body: { status: "SUSPENDED" } })}
        success="Storefront suspended"
      />
    </>
  );
}

function OrgPlanSelect({ org }: { org: Pick<OrgRow, "id" | "platformPlan"> }) {
  const patch = useOrgPatch(org.id);
  return (
    <Select value={org.platformPlan} disabled={patch.isPending} onValueChange={(v) => patch.mutate({ platformPlan: v })}>
      <SelectTrigger className="h-8 w-[8rem] border-zinc-700 bg-zinc-950 text-xs" aria-label="Platform plan">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PLATFORM_PLANS.map((p) => (
          <SelectItem key={p} value={p}>
            {p.toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface OrgDetail extends Omit<OrgRow, "counts"> {
  _count: OrgRow["counts"];
  activeCustomers: number;
  supportEmail: string | null;
  admins: { id: string; username: string; email: string; role: string; isActive: boolean }[];
}

const ORG_TABS = ["overview", "customers", "subscriptions", "plans", "activity"] as const;

function OrganizationDetail({ orgId }: { orgId: string }) {
  const { route, go, setQuery } = useRoute();
  const tab = (ORG_TABS as readonly string[]).includes(route.query.tab) ? route.query.tab : "overview";
  const [addOpen, setAddOpen] = useState(false);
  const [customerFilters, setCustomerFilters] = useState<CustomerFilters>({ search: "", state: "ALL", org: orgId, plan: "", page: 1 });
  const [subFilters, setSubFilters] = useState<SubscriptionFilters>({ state: "ALL", org: orgId, plan: "", search: "", from: "", to: "", page: 1 });

  const org = useQuery({
    queryKey: ["platform", "org", orgId],
    queryFn: () => api<OrgDetail>(`/api/platform/orgs/${orgId}`),
  });
  const patch = useOrgPatch(orgId);

  if (org.isLoading) return <TableSkeleton rows={6} cols={4} />;
  if (org.error instanceof ApiFailure && org.error.status === 404) {
    return <EmptyState title="Organization not found" action={<Button onClick={() => go("organizations")}>Back to organizations</Button>} />;
  }
  if (org.isError || !org.data) return <ErrorBox error={org.error} onRetry={() => org.refetch()} />;
  const o = org.data;

  const stat = (label: string, value: number, icon: typeof Users, onClick?: () => void) => {
    const Icon = icon;
    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left enabled:hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <div className="flex items-center justify-between text-xs text-zinc-400">
          {label} <Icon className="h-4 w-4 text-zinc-500" aria-hidden />
        </div>
        <div className="mt-1 text-2xl font-bold text-white">{value.toLocaleString("en-IN")}</div>
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        back={{ label: "Organizations", onClick: () => go("organizations") }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {o.name} <StatePill value={o.status} />
          </span>
        }
        description={`${o.slug}.${BASE_DOMAIN}${o.customDomain ? ` · ${o.customDomain}` : ""} · platform plan ${o.platformPlan.toLowerCase()}`}
        actions={
          <>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Add customer
            </Button>
            <Button variant="outline" onClick={() => setQuery({ tab: "customers" })}>
              <Users className="mr-1.5 h-4 w-4" /> View customers
            </Button>
            <Button variant="outline" onClick={() => setQuery({ tab: "subscriptions" })}>
              <CalendarClock className="mr-1.5 h-4 w-4" /> View subscriptions
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setQuery({ tab: v === "overview" ? undefined : v })}>
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="customers">Customers ({o._count.customers})</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="plans">Plans ({o._count.plans})</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stat("Customers", o._count.customers, Users, () => setQuery({ tab: "customers" }))}
            {stat("Plans", o._count.plans, Crown, () => setQuery({ tab: "plans" }))}
            {stat("Channels", o._count.channels, Tv)}
            {stat("Content sources", o._count.portals, Rss, () => go("sources", { query: { org: orgId } }))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Storefront">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status">
                  <OrgStatusSelect org={o} />
                </Field>
                <Field label="Platform plan">
                  <OrgPlanSelect org={o} />
                </Field>
                <Field label="Platform billing valid until" htmlFor="org-valid">
                  <input
                    id="org-valid"
                    type="date"
                    className={inputCls}
                    defaultValue={o.platformValidUntil ? o.platformValidUntil.slice(0, 10) : ""}
                    onBlur={(e) => {
                      const next = e.target.value || null;
                      const prev = o.platformValidUntil ? o.platformValidUntil.slice(0, 10) : null;
                      if (next !== prev) patch.mutate({ platformValidUntil: next });
                    }}
                  />
                </Field>
                <Field label="Support email">
                  <p className="text-sm text-zinc-300">{o.supportEmail ?? "—"}</p>
                </Field>
              </div>
            </Panel>
            <Panel title="Operators">
              {o.admins.length === 0 ? (
                <p className="text-sm text-zinc-500">No operator accounts.</p>
              ) : (
                <ul className="space-y-2">
                  {o.admins.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-sm">
                      <span>
                        <span className="text-zinc-100">{a.username}</span> <span className="text-zinc-500">· {a.email}</span>
                      </span>
                      <span className="text-xs text-zinc-400">
                        {a.role.toLowerCase()}
                        {!a.isActive && " · disabled"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-zinc-500">
                Channels and portals are synced and curated by these operators in their own admin panel (/admin on the storefront).
              </p>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="customers">
          <CustomersTable fixedOrgId={orgId} filters={customerFilters} onFilters={setCustomerFilters} onAdd={() => setAddOpen(true)} />
        </TabsContent>
        <TabsContent value="subscriptions">
          <SubscriptionsTable fixedOrgId={orgId} filters={subFilters} onFilters={setSubFilters} />
        </TabsContent>
        <TabsContent value="plans">
          <PlansTable organizationId={orgId} fixed />
        </TabsContent>
        <TabsContent value="activity">
          <AuditTable organizationId={orgId} withFilters />
        </TabsContent>
      </Tabs>

      {addOpen && <AddCustomerDialog presetOrgId={orgId} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
