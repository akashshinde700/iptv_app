"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarClock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, withQuery, type Paged, type SubscriptionRow } from "./api";
import { useRoute } from "./router";
import { SubscriptionActions } from "./SubscriptionDialogs";
import {
  Chips,
  DaysLeft,
  EmptyState,
  ErrorBox,
  fmtDate,
  inputCls,
  money,
  OrgSelect,
  PageHeader,
  Pager,
  StatePill,
  TableShell,
  TableSkeleton,
  Td,
  Th,
  useDebounced,
} from "./ui";

const STATE_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING", label: "Expiring in 7 days" },
  { value: "EXPIRED", label: "Expired" },
  { value: "PENDING", label: "Pending" },
  { value: "PAYMENT_PENDING", label: "Payment pending" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CANCELLED", label: "Cancelled" },
];

export interface SubscriptionFilters {
  state: string;
  org: string;
  plan: string;
  search: string;
  from: string;
  to: string;
  page: number;
}

export function SubscriptionsSection() {
  const { route, setQuery } = useRoute();
  const q = route.query;
  return (
    <>
      <PageHeader title="Subscriptions" description="Renew, extend, suspend or cancel — access follows these records." />
      <SubscriptionsTable
        filters={{ state: q.state ?? "ALL", org: q.org ?? "", plan: q.plan ?? "", search: q.q ?? "", from: q.from ?? "", to: q.to ?? "", page: Number(q.page ?? 1) }}
        onFilters={(f) =>
          setQuery({ state: f.state, org: f.org, plan: f.plan, q: f.search, from: f.from, to: f.to, page: f.page > 1 ? String(f.page) : undefined })
        }
      />
    </>
  );
}

export function SubscriptionsTable({
  filters,
  onFilters,
  fixedOrgId,
}: {
  filters: SubscriptionFilters;
  onFilters: (f: SubscriptionFilters) => void;
  fixedOrgId?: string;
}) {
  const { go } = useRoute();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const search = useDebounced(searchDraft, 350);
  const orgId = fixedOrgId ?? filters.org;
  if (search !== filters.search) onFilters({ ...filters, search, page: 1 });
  const set = (patch: Partial<SubscriptionFilters>) => onFilters({ ...filters, ...patch, page: patch.page ?? 1 });

  const query = useQuery({
    queryKey: ["platform", "subscriptions", orgId, filters.state, filters.plan, filters.search, filters.from, filters.to, filters.page],
    queryFn: () =>
      api<Paged<SubscriptionRow>>(
        withQuery("/api/platform/subscriptions", {
          organizationId: orgId,
          state: filters.state,
          planId: filters.plan,
          search: filters.search,
          from: filters.from,
          to: filters.to,
          page: filters.page,
        })
      ),
    placeholderData: keepPreviousData,
  });

  const hasFilters = filters.state !== "ALL" || !!filters.search || !!filters.plan || !!filters.from || !!filters.to || (!fixedOrgId && !!filters.org);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input className={`${inputCls} pl-9`} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search customer" aria-label="Search subscriptions by customer" />
        </div>
        {!fixedOrgId && <OrgSelect value={filters.org} onChange={(v) => set({ org: v === "ALL" ? "" : v })} />}
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          Ends from
          <input type="date" className={`${inputCls} w-auto`} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          to
          <input type="date" className={`${inputCls} w-auto`} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
      </div>
      <Chips label="Subscription status" options={STATE_OPTIONS} value={filters.state} onChange={(v) => set({ state: v })} />
      {filters.plan && (
        <p className="text-xs text-zinc-400">
          Filtered to one plan ·{" "}
          <button className="text-amber-300 hover:underline" onClick={() => set({ plan: "" })}>
            show all plans
          </button>
        </p>
      )}

      {query.isError && <ErrorBox error={query.error} onRetry={() => query.refetch()} />}
      {query.isLoading ? (
        <TableSkeleton cols={8} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-zinc-800">
          <EmptyState
            icon={CalendarClock}
            title={hasFilters ? "No subscriptions match these filters" : "No subscriptions yet"}
            message={hasFilters ? undefined : "Subscriptions are created from a customer's page."}
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchDraft("");
                    onFilters({ state: "ALL", org: fixedOrgId ? filters.org : "", plan: "", search: "", from: "", to: "", page: 1 });
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => go("customers")}>Go to customers</Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <TableShell minWidth={960}>
            <thead>
              <tr>
                <Th>Customer</Th>
                {!fixedOrgId && <Th>Organization</Th>}
                <Th>Plan</Th>
                <Th>Start</Th>
                <Th>Expiry</Th>
                <Th className="text-right">Amount</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-900/60">
                  <Td>
                    <button className="text-left" onClick={() => go("customers", { id: s.customerId, query: { tab: "subscription" } })}>
                      <div className="font-medium text-zinc-100 hover:underline">{s.customer?.name}</div>
                      <div className="text-xs text-zinc-500">@{s.customer?.username}</div>
                    </button>
                  </Td>
                  {!fixedOrgId && <Td className="text-zinc-300">{s.organization?.name}</Td>}
                  <Td className="text-zinc-300">{s.planName}</Td>
                  <Td className="text-zinc-400">{fmtDate(s.startsAt)}</Td>
                  <Td>
                    <div className="text-zinc-300">{fmtDate(s.endsAt)}</div>
                    <div className="text-xs">
                      <DaysLeft days={s.daysLeft} state={s.state} />
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums">{money(s.amount)}</Td>
                  <Td>
                    <StatePill value={s.paymentStatus} />
                  </Td>
                  <Td>
                    <StatePill value={s.state} />
                  </Td>
                  <Td className="text-right">
                    {s.state !== "CANCELLED" && <SubscriptionActions sub={s} customerName={s.customer?.name ?? "Customer"} showCustomerLink />}
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
