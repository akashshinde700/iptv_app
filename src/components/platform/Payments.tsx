"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IndianRupee, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, withQuery, type Paged, type PaymentRow } from "./api";
import { useRoute } from "./router";
import { ActionConfirm, PAYMENT_METHODS } from "./SubscriptionDialogs";
import {
  Chips,
  EmptyState,
  ErrorBox,
  fmtDateTime,
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

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "PAID", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "CANCELLED", label: "Cancelled" },
];

const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS);

export function PaymentsSection() {
  const { route, setQuery } = useRoute();
  const q = route.query;
  const [searchDraft, setSearchDraft] = useState(q.q ?? "");
  const search = useDebounced(searchDraft, 350);
  const filters = { status: q.status ?? "ALL", org: q.org ?? "", search: q.q ?? "", from: q.from ?? "", to: q.to ?? "", page: Number(q.page ?? 1) };
  if (search !== filters.search) setQuery({ q: search, page: undefined });
  const set = (patch: Record<string, string | undefined>) => setQuery({ ...patch, page: undefined });

  const query = useQuery({
    queryKey: ["platform", "payments", filters],
    queryFn: () =>
      api<Paged<PaymentRow> & { paidTotal: number }>(
        withQuery("/api/platform/payments", {
          organizationId: filters.org,
          status: filters.status,
          search: filters.search,
          from: filters.from,
          to: filters.to,
          page: filters.page,
        })
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Payments"
        description="Payments recorded against subscriptions. Recording is manual until a payment gateway is connected."
        actions={query.data && <span className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300">Paid in this view: <b className="text-white">{money(query.data.paidTotal)}</b></span>}
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input className={`${inputCls} pl-9`} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search customer, reference or payment ID" aria-label="Search payments" />
          </div>
          <OrgSelect value={filters.org} onChange={(v) => set({ org: v === "ALL" ? undefined : v })} />
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            From
            <input type="date" className={`${inputCls} w-auto`} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
            to
            <input type="date" className={`${inputCls} w-auto`} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </label>
        </div>
        <Chips label="Payment status" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => set({ status: v })} />
        {query.isError && <ErrorBox error={query.error} onRetry={() => query.refetch()} />}
        {query.isLoading ? (
          <TableSkeleton cols={7} />
        ) : (
          <>
            <PaymentsList payments={query.data?.items ?? []} showCustomer emptyMessage="No payments match these filters." />
            {query.data && <Pager page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} onPage={(page) => setQuery({ page: String(page) })} />}
          </>
        )}
      </div>
    </>
  );
}

export function PaymentsList({ payments, showCustomer = false, emptyMessage }: { payments: PaymentRow[]; showCustomer?: boolean; emptyMessage: string }) {
  const { go } = useRoute();
  if (payments.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800">
        <EmptyState icon={IndianRupee} title={emptyMessage} message="Payments are recorded from a subscription's actions menu." />
      </div>
    );
  }
  return (
    <TableShell minWidth={900}>
      <thead>
        <tr>
          <Th>Date</Th>
          {showCustomer && <Th>Customer</Th>}
          <Th>Subscription</Th>
          <Th className="text-right">Amount</Th>
          <Th>Method</Th>
          <Th>Transaction ID</Th>
          <Th>Status</Th>
          <Th className="text-right"> </Th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id} className="hover:bg-zinc-900/60">
            <Td className="whitespace-nowrap text-zinc-400">
              {fmtDateTime(p.paidAt ?? p.createdAt)}
              {p.recordedBy && <div className="text-xs text-zinc-600">by {p.recordedBy}</div>}
            </Td>
            {showCustomer && (
              <Td>
                <button className="text-left" onClick={() => go("customers", { id: p.customerId, query: { tab: "payments" } })}>
                  <div className="text-zinc-100 hover:underline">{p.customer?.name}</div>
                  <div className="text-xs text-zinc-500">{p.organization?.name}</div>
                </button>
              </Td>
            )}
            <Td className="text-zinc-300">{p.subscription?.planName ?? p.planName ?? "—"}</Td>
            <Td className="text-right tabular-nums text-zinc-100">{money(p.amount)}</Td>
            <Td className="text-zinc-400">{METHOD_LABEL[p.method] ?? p.method}</Td>
            <Td className="max-w-[12rem] text-xs text-zinc-400">
              <span className="block truncate" title={p.reference ?? undefined}>
                {p.reference ?? "—"}
              </span>
            </Td>
            <Td>
              <StatePill value={p.status} />
            </Td>
            <Td className="text-right">
              <PaymentActions payment={p} />
            </Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function PaymentActions({ payment }: { payment: PaymentRow }) {
  const [open, setOpen] = useState<null | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED">(null);
  const options: { to: "PAID" | "FAILED" | "CANCELLED" | "REFUNDED"; label: string }[] = [];
  if (payment.status === "PENDING" || payment.status === "FAILED") options.push({ to: "PAID", label: "Mark as paid" });
  if (payment.status === "PENDING") options.push({ to: "FAILED", label: "Mark as failed" });
  if (payment.status === "PENDING" || payment.status === "FAILED") options.push({ to: "CANCELLED", label: "Cancel payment" });
  if (payment.status === "PAID") options.push({ to: "REFUNDED", label: "Mark as refunded" });
  if (options.length === 0) return null;

  const copy: Record<string, [string, string, boolean]> = {
    PAID: ["Mark this payment as paid?", `${money(payment.amount)} is counted as received. A pending subscription activates once it is fully paid.`, false],
    FAILED: ["Mark this payment as failed?", "The payment stays on record as failed.", true],
    CANCELLED: ["Cancel this payment?", "It no longer counts towards the subscription.", true],
    REFUNDED: ["Mark this payment as refunded?", `${money(payment.amount)} is recorded as returned. The subscription itself stays as it is — cancel it separately if needed.`, true],
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="Payment actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {options.map((o) => (
            <DropdownMenuItem key={o.to} onSelect={() => setOpen(o.to)}>
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {open && (
        <ActionConfirm
          open
          onClose={() => setOpen(null)}
          title={copy[open][0]}
          description={copy[open][1]}
          confirmLabel={options.find((o) => o.to === open)?.label ?? "Confirm"}
          destructive={copy[open][2]}
          run={() => api(`/api/platform/payments/${payment.id}`, { method: "PATCH", body: { status: open } })}
          success="Payment updated"
        />
      )}
    </>
  );
}
