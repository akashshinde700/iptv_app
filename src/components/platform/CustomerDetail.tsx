"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  Pause,
  Pencil,
  Play,
  ShieldCheck,
  ShieldX,
  Trash2,
  Tv,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiFailure, type AccessSummary, type CustomerDetail, type SubscriptionRow } from "./api";
import { AuditTable } from "./Audit";
import { PaymentsList } from "./Payments";
import { useRoute } from "./router";
import { ActionConfirm, CreateSubscriptionDialog, SubscriptionActions } from "./SubscriptionDialogs";
import {
  ConfirmDialog,
  DaysLeft,
  deviceLabel,
  EmptyState,
  ErrorBox,
  Field,
  fmtDate,
  fmtDateTime,
  inputCls,
  money,
  PageHeader,
  Panel,
  StatePill,
  TableShell,
  TableSkeleton,
  Td,
  Th,
} from "./ui";

const TABS = ["overview", "subscription", "payments", "devices", "access", "activity"] as const;

export function CustomerDetailView({ customerId }: { customerId: string }) {
  const { route, go, setQuery } = useRoute();
  const tab = (TABS as readonly string[]).includes(route.query.tab) ? route.query.tab : "overview";
  const [dialog, setDialog] = useState<null | "edit" | "password" | "suspend" | "activate" | "archive" | "restore" | "delete" | "create">(null);
  const close = () => setDialog(null);

  const detail = useQuery({
    queryKey: ["platform", "customer", customerId],
    queryFn: () => api<CustomerDetail>(`/api/platform/customers/${customerId}`),
  });

  if (detail.isLoading) return <TableSkeleton rows={8} cols={3} />;
  if (detail.error instanceof ApiFailure && detail.error.status === 404) {
    return (
      <EmptyState
        title="Customer not found"
        message="It may have been deleted."
        action={<Button onClick={() => go("customers")}>Back to customers</Button>}
      />
    );
  }
  if (detail.isError || !detail.data) return <ErrorBox error={detail.error} onRetry={() => detail.refetch()} />;

  const { customer, subscriptions, sessions, payments, currentSubscriptionId } = detail.data;
  const current = subscriptions.find((s) => s.id === currentSubscriptionId) ?? null;
  const archived = customer.accountStatus === "ARCHIVED";
  const accountSuspended = customer.accountStatus === "SUSPENDED";
  const patchAccount = (accountStatus: string) => api(`/api/platform/customers/${customerId}`, { method: "PATCH", body: { accountStatus } });

  return (
    <div>
      <PageHeader
        back={{ label: "Customers", onClick: () => (window.history.length > 1 ? window.history.back() : go("customers")) }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.name} <StatePill value={customer.state} />
          </span>
        }
        description={
          <>
            @{customer.username} ·{" "}
            <button className="underline-offset-2 hover:underline" onClick={() => go("organizations", { id: customer.organization.id })}>
              {customer.organization.name}
            </button>
          </>
        }
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("password")}>
              <KeyRound className="mr-1.5 h-4 w-4" /> Reset password
            </Button>
            {!archived &&
              (accountSuspended ? (
                <Button size="sm" variant="outline" onClick={() => setDialog("activate")}>
                  <Play className="mr-1.5 h-4 w-4" /> Activate account
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setDialog("suspend")}>
                  <Pause className="mr-1.5 h-4 w-4" /> Suspend account
                </Button>
              ))}
            {archived ? (
              <Button size="sm" variant="outline" onClick={() => setDialog("restore")}>
                <ArchiveRestore className="mr-1.5 h-4 w-4" /> Restore
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setDialog("archive")}>
                <Archive className="mr-1.5 h-4 w-4" /> Archive
              </Button>
            )}
            <Button size="sm" variant="outline" className="border-red-500/40 text-red-300 hover:bg-red-500/10" onClick={() => setDialog("delete")}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setQuery({ tab: v === "overview" ? undefined : v })}>
        <div className="-mx-4 overflow-x-auto px-4">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
            <TabsTrigger value="devices">Devices ({sessions.length})</TabsTrigger>
            <TabsTrigger value="access">Channel access</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Customer">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Customer ID" value={<code className="break-all text-xs text-zinc-300">{customer.id}</code>} />
                <Info label="Email" value={customer.email} />
                <Info label="Mobile" value={customer.mobile ?? "—"} />
                <Info label="Organization" value={customer.organization.name} />
                <Info label="Account" value={<StatePill value={customer.accountStatus} />} />
                <Info label="Created" value={fmtDate(customer.createdAt)} />
                <Info label="Last login" value={customer.lastLoginAt ? fmtDateTime(customer.lastLoginAt) : "Never"} />
                <Info label="Notes" value={customer.notes ?? "—"} />
              </dl>
            </Panel>
            <Panel
              title="Subscription"
              actions={
                current ? (
                  <Button size="sm" variant="outline" onClick={() => setQuery({ tab: "subscription" })}>
                    Manage
                  </Button>
                ) : (
                  !archived && (
                    <Button size="sm" onClick={() => setDialog("create")}>
                      <CalendarPlus className="mr-1.5 h-4 w-4" /> Create subscription
                    </Button>
                  )
                )
              }
            >
              {current ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Info label="Current plan" value={current.planName} />
                  <Info label="Status" value={<StatePill value={current.state} />} />
                  <Info label="Valid until" value={<>{fmtDate(current.endsAt)} · <DaysLeft days={current.daysLeft} state={current.state} /></>} />
                  <Info label="Payment" value={<StatePill value={current.paymentStatus} />} />
                  <Info label="Devices" value={`${sessions.length} signed in${customer.plan ? ` · limit ${customer.plan.maxDevices}` : ""}`} />
                  <Info label="Amount" value={money(current.amount)} />
                </dl>
              ) : (
                <EmptyState icon={ShieldX} title="No active subscription" message="This customer can log in but can't watch paid channels." />
              )}
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-4">
          {current ? (
            <Panel
              title="Current subscription"
              actions={
                <Button size="sm" variant="outline" onClick={() => setDialog("create")} disabled={archived}>
                  <CalendarPlus className="mr-1.5 h-4 w-4" /> New subscription
                </Button>
              }
            >
              <CurrentSubscription sub={current} maxDevices={customer.plan?.maxDevices ?? null} />
              {!archived && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <SubscriptionActions sub={current} customerName={customer.name} variant="buttons" />
                </div>
              )}
            </Panel>
          ) : (
            <Panel>
              <EmptyState
                icon={ShieldX}
                title="No active subscription"
                message={archived ? "Restore the customer to give them a subscription." : "Create a subscription to give this customer access to paid channels."}
                action={
                  !archived && (
                    <Button onClick={() => setDialog("create")}>
                      <CalendarPlus className="mr-1.5 h-4 w-4" /> Create subscription
                    </Button>
                  )
                }
              />
            </Panel>
          )}
          <Panel title={`History (${subscriptions.length})`}>
            {subscriptions.length === 0 ? (
              <p className="text-sm text-zinc-500">No subscriptions yet.</p>
            ) : (
              <TableShell minWidth={820}>
                <thead>
                  <tr>
                    <Th>Plan</Th>
                    <Th>Period</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Payment</Th>
                    <Th>Created by</Th>
                    <Th className="text-right"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.id}>
                      <Td>
                        <div className="text-zinc-100">{s.planName}</div>
                        {s.notes && <div className="text-xs text-zinc-500">{s.notes}</div>}
                      </Td>
                      <Td className="text-zinc-300">
                        {fmtDate(s.startsAt)} → {fmtDate(s.endsAt)}
                      </Td>
                      <Td>
                        <StatePill value={s.state} />
                      </Td>
                      <Td className="text-right tabular-nums">
                        {money(s.amount)}
                        {s.discount > 0 && <div className="text-xs text-zinc-500">−{money(s.discount)} discount</div>}
                      </Td>
                      <Td>
                        <StatePill value={s.paymentStatus} />
                      </Td>
                      <Td className="text-xs text-zinc-400">{s.createdBy ?? "—"}</Td>
                      <Td className="text-right">{!archived && s.state !== "CANCELLED" && <SubscriptionActions sub={s} customerName={customer.name} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsList payments={payments} emptyMessage="No payments recorded for this customer." />
        </TabsContent>

        <TabsContent value="devices">
          <DevicesPanel customerId={customerId} sessions={sessions} maxDevices={customer.plan?.maxDevices ?? null} />
        </TabsContent>

        <TabsContent value="access">
          <AccessPanel customerId={customerId} />
        </TabsContent>

        <TabsContent value="activity">
          <AuditTable entityIds={[customerId, ...subscriptions.map((s) => s.id), ...payments.map((p) => p.id)]} />
        </TabsContent>
      </Tabs>

      {dialog === "create" && (
        <CreateSubscriptionDialog
          mode={current ? "change" : "create"}
          customer={{ id: customer.id, name: customer.name, organizationId: customer.organization.id }}
          onClose={close}
        />
      )}
      {dialog === "edit" && <EditCustomerDialog customer={customer} onClose={close} />}
      {dialog === "password" && <ResetPasswordDialog customerId={customer.id} name={customer.name} onClose={close} />}
      <ActionConfirm
        open={dialog === "suspend"}
        onClose={close}
        title="Suspend this customer?"
        description={`${customer.name} is signed out of every device and loses access to subscription-protected content until you activate the account again.`}
        confirmLabel="Suspend account"
        destructive
        run={() => patchAccount("SUSPENDED")}
        success="Customer suspended"
      />
      <ActionConfirm
        open={dialog === "activate"}
        onClose={close}
        title="Activate this account?"
        description={`${customer.name} can log in again. Channel access follows their subscription.`}
        confirmLabel="Activate"
        run={() => patchAccount("ACTIVE")}
        success="Customer activated"
      />
      <ActionConfirm
        open={dialog === "archive"}
        onClose={close}
        title="Archive this customer?"
        description="Archived customers can't log in, are signed out everywhere and are hidden from lists. Their history is kept and you can restore them later."
        confirmLabel="Archive"
        destructive
        run={() => patchAccount("ARCHIVED")}
        success="Customer archived"
      />
      <ActionConfirm
        open={dialog === "restore"}
        onClose={close}
        title="Restore this customer?"
        description="The account becomes active again. Channel access follows their subscription."
        confirmLabel="Restore"
        run={() => patchAccount("ACTIVE")}
        success="Customer restored"
      />
      {dialog === "delete" && <DeleteCustomerDialog customerId={customer.id} username={customer.username} onClose={close} onDeleted={() => go("customers")} />}
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

function CurrentSubscription({ sub, maxDevices }: { sub: SubscriptionRow; maxDevices: number | null }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Info label="Plan" value={<span className="text-base font-semibold text-white">{sub.planName}</span>} />
      <Info label="Status" value={<StatePill value={sub.state} />} />
      <Info label="Start date" value={fmtDate(sub.startsAt)} />
      <Info label="Expiry date" value={fmtDate(sub.endsAt)} />
      <Info label="Remaining" value={<DaysLeft days={sub.daysLeft} state={sub.state} />} />
      <Info label="Price" value={`${money(sub.price)}${sub.discount ? ` − ${money(sub.discount)}` : ""} = ${money(sub.amount)}`} />
      <Info label="Payment status" value={<StatePill value={sub.paymentStatus} />} />
      <Info label="Device limit" value={maxDevices ?? "—"} />
      <Info label="Auto renewal" value={sub.autoRenew ? "On" : "Off (manual renewal)"} />
    </dl>
  );
}

function DevicesPanel({ customerId, sessions, maxDevices }: { customerId: string; sessions: CustomerDetail["sessions"]; maxDevices: number | null }) {
  const [revoke, setRevoke] = useState<string | null>(null);
  const [revokeAll, setRevokeAll] = useState(false);
  return (
    <Panel
      title={`Signed-in devices (${sessions.length}${maxDevices ? ` of ${maxDevices}` : ""})`}
      actions={
        sessions.length > 0 && (
          <Button size="sm" variant="outline" className="border-red-500/40 text-red-300 hover:bg-red-500/10" onClick={() => setRevokeAll(true)}>
            Sign out all devices
          </Button>
        )
      }
    >
      <p className="mb-3 text-xs text-zinc-500">
        When the device limit is reached, the oldest device is signed out automatically at the next login.
      </p>
      {sessions.length === 0 ? (
        <EmptyState icon={MonitorSmartphone} title="No devices signed in" />
      ) : (
        <TableShell minWidth={640}>
          <thead>
            <tr>
              <Th>Device</Th>
              <Th>IP address</Th>
              <Th>Signed in</Th>
              <Th>Session ends</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <Td>
                  <div className="text-zinc-100">{deviceLabel(s.userAgent)}</div>
                  <div className="max-w-[20rem] truncate text-xs text-zinc-500" title={s.userAgent ?? undefined}>
                    {s.userAgent ?? "Unknown device"}
                  </div>
                </Td>
                <Td className="text-zinc-400">{s.ip ?? "—"}</Td>
                <Td className="text-zinc-400">{fmtDateTime(s.createdAt)}</Td>
                <Td className="text-zinc-400">{fmtDate(s.expiresAt)}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setRevoke(s.id)}>
                    Revoke
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <ActionConfirm
        open={revoke !== null}
        onClose={() => setRevoke(null)}
        title="Revoke this device?"
        description="The device is signed out immediately. The customer can log in again if their account and subscription allow it."
        confirmLabel="Revoke device"
        destructive
        run={() => api(`/api/platform/customers/${customerId}/sessions/${revoke}`, { method: "DELETE" })}
        success="Device revoked"
      />
      <ActionConfirm
        open={revokeAll}
        onClose={() => setRevokeAll(false)}
        title="Sign out every device?"
        description="All devices are signed out immediately."
        confirmLabel="Sign out all"
        destructive
        run={() => api(`/api/platform/customers/${customerId}/sessions`, { method: "DELETE" })}
        success="Signed out of all devices"
      />
    </Panel>
  );
}

function AccessPanel({ customerId }: { customerId: string }) {
  const access = useQuery({
    queryKey: ["platform", "customer-access", customerId],
    queryFn: () => api<AccessSummary>(`/api/platform/customers/${customerId}/access`),
  });
  if (access.isLoading) return <TableSkeleton rows={3} cols={2} />;
  if (access.isError || !access.data) return <ErrorBox error={access.error} onRetry={() => access.refetch()} />;
  const a = access.data;
  const reasons: Record<string, string> = {
    "No plan assigned": "No active subscription",
    "Plan expired": "The subscription has expired",
    "Plan inactive": "The plan has been deactivated",
    "Customer suspended": "The account or subscription is suspended",
    "Customer expired": "The subscription has expired",
    "Customer inactive": "The subscription is pending payment or activation",
    "Customer archived": "The customer is archived",
  };
  const rules = [
    ["Categories", a.rules.categories],
    ["Languages", a.rules.languages],
    ["Countries", a.rules.countries],
    ["Regions", a.rules.regions],
  ] as const;
  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          {a.hasAccess ? <ShieldCheck className="h-10 w-10 text-emerald-400" aria-hidden /> : <ShieldX className="h-10 w-10 text-red-400" aria-hidden />}
          <div>
            <p className="text-lg font-semibold text-white">
              {a.hasAccess ? `${a.total.toLocaleString("en-IN")} channels available` : "No paid channels available"}
            </p>
            <p className="text-sm text-zinc-400">
              {a.hasAccess ? `Plan: ${a.planName} · adult content ${a.allowAdult ? "allowed" : "blocked"}` : reasons[a.reason] ?? a.reason}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Checked by the same server-side rules the player uses.</p>
          </div>
        </div>
      </Panel>
      {a.hasAccess && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Plan rules">
            <dl className="space-y-2">
              {rules.map(([label, values]) => (
                <div key={label} className="flex flex-wrap items-baseline gap-2">
                  <dt className="w-24 text-xs text-zinc-500">{label}</dt>
                  <dd className="flex flex-wrap gap-1 text-xs">
                    {values.length === 0 ? <span className="text-zinc-400">All</span> : values.map((v) => <span key={v} className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{v}</span>)}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Top categories">
            <ul className="space-y-1.5">
              {a.byCategory.map((c) => (
                <li key={c.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-zinc-300">
                    <Tv className="h-3.5 w-3.5 text-zinc-500" aria-hidden /> {c.key}
                  </span>
                  <span className="tabular-nums text-zinc-400">{c.count}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

function EditCustomerDialog({ customer, onClose }: { customer: CustomerDetail["customer"]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: customer.name, email: customer.email, mobile: customer.mobile ?? "", notes: customer.notes ?? "" });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api(`/api/platform/customers/${customer.id}`, { method: "PATCH", body: { ...form, mobile: form.mobile || null, notes: form.notes || null } }),
    onSuccess: () => {
      toast.success("Customer updated");
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Edit customer</DialogTitle>
          <DialogDescription className="text-zinc-400">The username (login ID) can't be changed.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="edit-name">
            <input id="edit-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Mobile" htmlFor="edit-mobile">
            <input id="edit-mobile" className={inputCls} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="edit-email" className="sm:col-span-2">
            <input id="edit-email" type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="edit-notes" className="sm:col-span-2">
            <textarea id="edit-notes" rows={3} className={`${inputCls} h-auto py-2`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ customerId, name, onClose }: { customerId: string; name: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api(`/api/platform/customers/${customerId}`, { method: "PATCH", body: { password } }),
    onSuccess: () => {
      toast.success("Password reset — all devices signed out");
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Reset password — {name}</DialogTitle>
          <DialogDescription className="text-zinc-400">The customer is signed out of every device and must use the new password.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="New password" htmlFor="reset-pass">
            <input id="reset-pass" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" htmlFor="reset-confirm">
            <input id="reset-confirm" type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        {error && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button
            onClick={() => {
              if (password.length < 6) return setError("Password must be at least 6 characters.");
              if (password !== confirm) return setError("Passwords don't match.");
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCustomerDialog({ customerId, username, onClose, onDeleted }: { customerId: string; username: string; onClose: () => void; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Permanently delete this customer?"
      description="This removes the customer, their subscriptions, payments and devices for good. Prefer Archive if you might need the history."
      confirmLabel="Delete permanently"
      destructive
      onConfirm={async () => {
        if (typed !== username) throw new Error(`Type ${username} to confirm.`);
        await api(`/api/platform/customers/${customerId}?confirm=${encodeURIComponent(typed)}`, { method: "DELETE" });
        toast.success("Customer deleted");
        queryClient.invalidateQueries({ queryKey: ["platform"] });
        onDeleted();
      }}
    >
      <Field label={`Type ${username} to confirm`} htmlFor="delete-confirm">
        <input id="delete-confirm" className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Field>
    </ConfirmDialog>
  );
}
