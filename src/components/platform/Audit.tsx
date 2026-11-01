"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api, withQuery, type AuditRow, type Paged } from "./api";
import { useRoute } from "./router";
import { Chips, EmptyState, ErrorBox, fmtDateTime, OrgSelect, PageHeader, Pager, TableShell, TableSkeleton, Td, Th } from "./ui";

export const ACTION_LABELS: Record<string, string> = {
  CUSTOMER_CREATE: "Customer created",
  CUSTOMER_UPDATE: "Customer updated",
  CUSTOMER_PASSWORD_RESET: "Password reset",
  CUSTOMER_SUSPEND: "Customer suspended",
  CUSTOMER_ACTIVATE: "Customer activated",
  CUSTOMER_ARCHIVE: "Customer archived",
  CUSTOMER_DELETE: "Customer deleted",
  CUSTOMER_LOGOUT_DEVICES: "Signed out of all devices",
  CUSTOMER_DEVICE_REVOKE: "Device revoked",
  CUSTOMER_STATUS_CHANGE: "Customer status changed",
  SUBSCRIPTION_CREATE: "Subscription created",
  SUBSCRIPTION_CHANGE_PLAN: "Plan changed",
  SUBSCRIPTION_RENEW: "Subscription renewed",
  SUBSCRIPTION_EXTEND: "Subscription extended",
  SUBSCRIPTION_SUSPEND: "Subscription suspended",
  SUBSCRIPTION_RESUME: "Subscription resumed",
  SUBSCRIPTION_CANCEL: "Subscription cancelled",
  PAYMENT_RECORD: "Payment recorded",
  PAYMENT_UPDATE: "Payment updated",
  PLAN_CREATE: "Plan created",
  PLAN_UPDATE: "Plan updated",
  PLAN_ACTIVATE: "Plan activated",
  PLAN_DEACTIVATE: "Plan deactivated",
  PLAN_DELETE: "Plan deleted",
  SOURCE_CREATE: "Source added",
  SOURCE_UPDATE: "Source updated",
  SOURCE_CREDENTIALS_CHANGE: "Source credentials changed",
  SOURCE_TEST: "Source tested",
  SOURCE_SYNC: "Source synced",
  SOURCE_SYNC_FAILED: "Source sync failed",
  SOURCE_ENABLE: "Source enabled",
  SOURCE_DISABLE: "Source disabled",
  SOURCE_DELETE: "Source deleted",
  PLATFORM_ORG_CREATE: "Organization created",
  PLATFORM_ORG_UPDATE: "Organization updated",
  PLATFORM_ORG_DELETE: "Organization deleted",
};

const ACTION_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "CUSTOMER", label: "Customers" },
  { value: "SUBSCRIPTION", label: "Subscriptions" },
  { value: "PAYMENT", label: "Payments" },
  { value: "PLAN", label: "Plans" },
  { value: "SOURCE", label: "Sources" },
  { value: "PLATFORM_ORG", label: "Organizations" },
];

function summarize(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toLocaleDateString("en-IN") : String(v)}`)
      .join(" · ");
  } catch {
    return value;
  }
}

export function AuditSection() {
  const { route, setQuery } = useRoute();
  return (
    <>
      <PageHeader title="Audit log" description="Every important admin action, who did it and what changed." />
      <div className="mb-3">
        <OrgSelect value={route.query.org ?? ""} onChange={(v) => setQuery({ org: v === "ALL" ? undefined : v })} />
      </div>
      <AuditTable organizationId={route.query.org || undefined} withFilters />
    </>
  );
}

export function AuditTable({ organizationId, entityIds, withFilters = false }: { organizationId?: string; entityIds?: string[]; withFilters?: boolean }) {
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["platform", "audit", organizationId, entityIds?.join(","), action, page],
    queryFn: () =>
      api<Paged<AuditRow>>(
        withQuery("/api/platform/audit-logs", { organizationId, entityIds: entityIds?.join(","), action, page })
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-3">
      {withFilters && (
        <Chips
          label="Action type"
          options={ACTION_FILTERS}
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
        />
      )}
      {query.isError && <ErrorBox error={query.error} onRetry={() => query.refetch()} />}
      {query.isLoading ? (
        <TableSkeleton cols={4} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-zinc-800">
          <EmptyState icon={ScrollText} title="No activity yet" />
        </div>
      ) : (
        <>
          <TableShell minWidth={720}>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>By</Th>
                <Th>Details</Th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((log) => (
                <tr key={log.id}>
                  <Td className="whitespace-nowrap text-xs text-zinc-400">{fmtDateTime(log.createdAt)}</Td>
                  <Td>
                    <div className="text-zinc-100">{ACTION_LABELS[log.action] ?? log.action}</div>
                    {log.organization && !organizationId && <div className="text-xs text-zinc-500">{log.organization.name}</div>}
                  </Td>
                  <Td className="text-zinc-300">{log.adminName}</Td>
                  <Td className="max-w-[28rem] text-xs text-zinc-400">
                    {summarize(log.oldValue) && <div className="truncate" title={summarize(log.oldValue) ?? undefined}>Before — {summarize(log.oldValue)}</div>}
                    {summarize(log.newValue) && <div className="truncate" title={summarize(log.newValue) ?? undefined}>After — {summarize(log.newValue)}</div>}
                  </Td>
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
