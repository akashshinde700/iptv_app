"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { api, type PlanRow } from "./api";
import { PlanBuilder } from "./PlanBuilder";
import { useRoute } from "./router";
import { ActionConfirm } from "./SubscriptionDialogs";
import { EmptyState, ErrorBox, Field, inputCls, money, OrgSelect, PageHeader, StatePill, TableShell, TableSkeleton, Td, Th, usePlans } from "./ui";

export function PlansSection() {
  const { route, setQuery } = useRoute();
  const org = route.query.org ?? "";
  return (
    <>
      <PageHeader title="Plans" description="What customers can subscribe to in each organization — price, validity, devices and channel rules." />
      <div className="mb-3">
        <OrgSelect value={org} onChange={(v) => setQuery({ org: v === "ALL" ? undefined : v })} />
      </div>
      <PlansTable organizationId={org || undefined} />
    </>
  );
}

export function PlansTable({ organizationId, fixed = false }: { organizationId?: string; fixed?: boolean }) {
  const { go } = useRoute();
  const plans = usePlans(organizationId);
  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);
  const [toggle, setToggle] = useState<PlanRow | null>(null);
  const [remove, setRemove] = useState<PlanRow | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-1.5 h-4 w-4" /> Create plan
        </Button>
      </div>
      {plans.isError && <ErrorBox error={plans.error} onRetry={() => plans.refetch()} />}
      {plans.isLoading ? (
        <TableSkeleton cols={6} />
      ) : (plans.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-zinc-800">
          <EmptyState icon={Crown} title="No plans yet" message="Create a plan before giving customers a subscription." action={<Button onClick={() => setEditing("new")}>Create plan</Button>} />
        </div>
      ) : (
        <TableShell minWidth={880}>
          <thead>
            <tr>
              <Th>Plan</Th>
              {!fixed && <Th>Organization</Th>}
              <Th className="text-right">Price</Th>
              <Th>Validity</Th>
              <Th className="text-right">Devices</Th>
              <Th>Channels</Th>
              <Th className="text-right">Subscribers</Th>
              <Th>Status</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {(plans.data ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-zinc-900/60">
                <Td>
                  <div className="font-medium text-zinc-100">{p.name}</div>
                  {p.description && <div className="max-w-[18rem] truncate text-xs text-zinc-500">{p.description}</div>}
                </Td>
                {!fixed && <Td className="text-zinc-300">{p.organization.name}</Td>}
                <Td className="text-right tabular-nums">{money(p.price)}</Td>
                <Td className="text-zinc-300">{p.durationDays} days</Td>
                <Td className="text-right tabular-nums">{p.maxDevices}</Td>
                <Td className="max-w-[14rem] text-xs text-zinc-400">
                  {[p.categories.length ? `${p.categories.length} categories` : null, p.languages.length ? p.languages.join(", ") : null, p.countries.length ? p.countries.join(", ") : null]
                    .filter(Boolean)
                    .join(" · ") || "All channels"}
                  {p.allowAdult ? " · 18+" : ""}
                </Td>
                <Td className="text-right tabular-nums">
                  <button className="hover:underline" onClick={() => go("subscriptions", { query: { plan: p.id, state: "ACTIVE" } })}>
                    {p.activeSubscriptions}
                  </button>
                </Td>
                <Td>
                  <StatePill value={p.isActive ? "ACTIVE" : "CANCELLED"} className={!p.isActive ? "[&]:text-zinc-400" : undefined} />
                </Td>
                <Td className="text-right">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" aria-label={`Actions for ${p.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(p)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => go("subscriptions", { query: { plan: p.id } })}>View subscribers</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setToggle(p)}>{p.isActive ? "Deactivate (archive)" : "Activate"}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-300 focus:text-red-200" onSelect={() => setRemove(p)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {editing && <PlanBuilder plan={editing === "new" ? null : editing} presetOrgId={organizationId} lockOrg={fixed} onClose={() => setEditing(null)} />}
      {toggle && (
        <ActionConfirm
          open
          onClose={() => setToggle(null)}
          title={toggle.isActive ? `Deactivate ${toggle.name}?` : `Activate ${toggle.name}?`}
          description={
            toggle.isActive
              ? "No new subscriptions can use this plan, and customers on it lose access to its channels. Keep it active if people should keep watching."
              : "The plan can be used for new subscriptions again."
          }
          confirmLabel={toggle.isActive ? "Deactivate" : "Activate"}
          destructive={toggle.isActive}
          run={() => api(`/api/platform/plans/${toggle.id}`, { method: "PATCH", body: { isActive: !toggle.isActive } })}
          success={toggle.isActive ? "Plan deactivated" : "Plan activated"}
        />
      )}
      {remove && (
        <ActionConfirm
          open
          onClose={() => setRemove(null)}
          title={`Delete ${remove.name}?`}
          description="Only plans that were never used can be deleted. Plans with subscribers must be deactivated instead."
          confirmLabel="Delete plan"
          destructive
          run={() => api(`/api/platform/plans/${remove.id}`, { method: "DELETE" })}
          success="Plan deleted"
        />
      )}
    </div>
  );
}
