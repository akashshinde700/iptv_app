"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CalendarPlus, CreditCard, Loader2, MoreHorizontal, Pause, Play, RefreshCw, Repeat, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, type SubscriptionRow } from "./api";
import { useRoute } from "./router";
import { ConfirmDialog, Field, fmtDate, inputCls, money, todayInput, usePlans } from "./ui";

export const PAYMENT_METHODS: [string, string][] = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["CARD", "Card"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["OTHER", "Other"],
];

const DAY = 86_400_000;

function addDaysLabel(start: string | Date, days: number): string {
  const base = typeof start === "string" ? new Date(`${start}T00:00:00`) : start;
  return fmtDate(new Date(base.getTime() + days * DAY).toISOString());
}

/* ------------------------------ form model ------------------------------ */

export interface SubDraft {
  planId: string;
  startsAt: string;
  durationDays: string;
  price: string;
  discount: string;
  status: "ACTIVE" | "PENDING";
  recordPayment: boolean;
  paymentStatus: "PAID" | "PENDING" | "FAILED";
  method: string;
  reference: string;
  notes: string;
}

export function emptySubDraft(): SubDraft {
  return {
    planId: "",
    startsAt: todayInput(),
    durationDays: "",
    price: "",
    discount: "0",
    status: "ACTIVE",
    recordPayment: true,
    paymentStatus: "PAID",
    method: "CASH",
    reference: "",
    notes: "",
  };
}

export function subDraftBody(d: SubDraft) {
  return {
    planId: d.planId,
    startsAt: d.startsAt || undefined,
    durationDays: d.durationDays !== "" ? Number(d.durationDays) : undefined,
    price: d.price !== "" ? Number(d.price) : undefined,
    discount: d.discount !== "" ? Number(d.discount) : 0,
    status: d.status,
    notes: d.notes || undefined,
    payment: d.recordPayment ? { status: d.paymentStatus, method: d.method, reference: d.reference || undefined } : null,
  };
}

function PaymentFields({
  status,
  method,
  reference,
  onChange,
  idPrefix,
}: {
  status: string;
  method: string;
  reference: string;
  onChange: (patch: { paymentStatus?: "PAID" | "PENDING" | "FAILED"; method?: string; reference?: string }) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field label="Payment status" htmlFor={`${idPrefix}-pstatus`}>
        <Select value={status} onValueChange={(v) => onChange({ paymentStatus: v as "PAID" | "PENDING" | "FAILED" })}>
          <SelectTrigger id={`${idPrefix}-pstatus`} className="h-9 border-zinc-700 bg-zinc-950">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Payment method" htmlFor={`${idPrefix}-method`}>
        <Select value={method} onValueChange={(v) => onChange({ method: v })}>
          <SelectTrigger id={`${idPrefix}-method`} className="h-9 border-zinc-700 bg-zinc-950">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Transaction / reference ID" htmlFor={`${idPrefix}-ref`} className="sm:col-span-2">
        <input id={`${idPrefix}-ref`} className={inputCls} value={reference} onChange={(e) => onChange({ reference: e.target.value })} placeholder="UPI ref, receipt no…" />
      </Field>
    </>
  );
}

/** Plan, dates, price, payment — used by "Add customer" and "Create subscription". */
export function SubscriptionFields({
  organizationId,
  draft,
  onChange,
  idPrefix = "sub",
}: {
  organizationId: string;
  draft: SubDraft;
  onChange: (draft: SubDraft) => void;
  idPrefix?: string;
}) {
  const plans = usePlans(organizationId || undefined);
  const available = (plans.data ?? []).filter((p) => p.isActive && p.organizationId === organizationId);
  const plan = available.find((p) => p.id === draft.planId);
  const set = (patch: Partial<SubDraft>) => onChange({ ...draft, ...patch });

  if (!organizationId) return <p className="text-sm text-zinc-500">Choose an organization first.</p>;
  if (plans.isLoading) return <p className="text-sm text-zinc-500">Loading plans…</p>;
  if (available.length === 0) {
    return <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">This organization has no active plans yet — create one in Plans first.</p>;
  }

  const price = draft.price === "" ? plan?.price ?? 0 : Number(draft.price) || 0;
  const final = Math.max(0, price - (Number(draft.discount) || 0));
  const days = draft.durationDays === "" ? plan?.durationDays ?? 0 : Number(draft.durationDays) || 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Plan" htmlFor={`${idPrefix}-plan`} className="sm:col-span-2">
        <Select
          value={draft.planId}
          onValueChange={(v) => {
            const p = available.find((x) => x.id === v);
            set({ planId: v, durationDays: String(p?.durationDays ?? ""), price: String(p?.price ?? "") });
          }}
        >
          <SelectTrigger id={`${idPrefix}-plan`} className="h-9 border-zinc-700 bg-zinc-950">
            <SelectValue placeholder="Choose a plan" />
          </SelectTrigger>
          <SelectContent>
            {available.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {money(p.price)} / {p.durationDays} days · {p.maxDevices} {p.maxDevices === 1 ? "device" : "devices"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Start date" htmlFor={`${idPrefix}-start`}>
        <input id={`${idPrefix}-start`} type="date" max={todayInput()} className={inputCls} value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
      </Field>
      <Field label="Duration (days)" htmlFor={`${idPrefix}-days`}>
        <input id={`${idPrefix}-days`} type="number" min={1} max={3650} className={inputCls} value={draft.durationDays} onChange={(e) => set({ durationDays: e.target.value })} />
      </Field>
      <Field label="Price (₹)" htmlFor={`${idPrefix}-price`}>
        <input id={`${idPrefix}-price`} type="number" min={0} className={inputCls} value={draft.price} onChange={(e) => set({ price: e.target.value })} />
      </Field>
      <Field label="Discount (₹)" htmlFor={`${idPrefix}-discount`}>
        <input id={`${idPrefix}-discount`} type="number" min={0} className={inputCls} value={draft.discount} onChange={(e) => set({ discount: e.target.value })} />
      </Field>
      <div className="flex flex-wrap justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm sm:col-span-2">
        <span className="text-zinc-400">
          Final amount <b className="text-white">{money(final)}</b>
        </span>
        <span className="text-zinc-400">
          Valid until <b className="text-white">{draft.startsAt && days ? addDaysLabel(draft.startsAt, days) : "—"}</b>
        </span>
      </div>
      <Field label="Status" htmlFor={`${idPrefix}-status`} className="sm:col-span-2">
        <Select value={draft.status} onValueChange={(v) => set({ status: v as "ACTIVE" | "PENDING" })}>
          <SelectTrigger id={`${idPrefix}-status`} className="h-9 border-zinc-700 bg-zinc-950">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active now — the customer can watch immediately</SelectItem>
            <SelectItem value="PENDING">Pending — no access until it is paid or activated</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
        <Switch checked={draft.recordPayment} onCheckedChange={(v) => set({ recordPayment: v })} /> Record a payment now
      </label>
      {draft.recordPayment && (
        <PaymentFields
          idPrefix={idPrefix}
          status={draft.paymentStatus}
          method={draft.method}
          reference={draft.reference}
          onChange={(patch) => set(patch)}
        />
      )}
      <Field label="Notes" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
        <textarea id={`${idPrefix}-notes`} rows={2} className={`${inputCls} h-auto py-2`} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </div>
  );
}

/* -------------------------------- dialogs -------------------------------- */

function DialogShell({
  title,
  description,
  children,
  error,
  busy,
  submitLabel,
  submitDisabled,
  onSubmit,
  onClose,
  wide = false,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  error: string | null;
  busy: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className={`max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-950 ${wide ? "sm:max-w-xl" : "sm:max-w-md"}`}>
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
          {description && <DialogDescription className="text-zinc-400">{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {error && (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={busy || submitDisabled} aria-busy={busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useAction<T>(fn: () => Promise<T>, success: string, onClose: () => void) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: fn,
    onMutate: () => setError(null),
    onSuccess: () => {
      toast.success(success);
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return { error, run: () => mutation.mutate(), busy: mutation.isPending };
}

export function CreateSubscriptionDialog({
  customer,
  mode,
  onClose,
}: {
  customer: { id: string; name: string; organizationId: string };
  mode: "create" | "change";
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(emptySubDraft);
  const action = useAction(
    () => api(`/api/platform/customers/${customer.id}/subscriptions`, { method: "POST", body: { ...subDraftBody(draft), replaceCurrent: mode === "change" } }),
    mode === "change" ? "Plan changed" : "Subscription created",
    onClose
  );
  return (
    <DialogShell
      wide
      title={mode === "change" ? `Change plan — ${customer.name}` : `Create subscription — ${customer.name}`}
      description={
        mode === "change"
          ? "Upgrade or downgrade: the running subscription is cancelled and the new plan starts from the start date."
          : "Plans come from this customer's organization."
      }
      error={action.error}
      busy={action.busy}
      submitLabel={mode === "change" ? "Change plan" : "Create subscription"}
      submitDisabled={!draft.planId}
      onSubmit={action.run}
      onClose={onClose}
    >
      <SubscriptionFields organizationId={customer.organizationId} draft={draft} onChange={setDraft} idPrefix="create-sub" />
    </DialogShell>
  );
}

function periodDays(sub: SubscriptionRow): number {
  return Math.max(1, Math.round((new Date(sub.endsAt).getTime() - new Date(sub.startsAt).getTime()) / DAY));
}

export function RenewDialog({ sub, onClose }: { sub: SubscriptionRow; onClose: () => void }) {
  const [days, setDays] = useState(String(periodDays(sub)));
  const [price, setPrice] = useState(String(sub.price));
  const [discount, setDiscount] = useState("0");
  const [recordPayment, setRecordPayment] = useState(true);
  const [payment, setPayment] = useState({ paymentStatus: "PAID" as "PAID" | "PENDING" | "FAILED", method: "CASH", reference: "" });
  const startsFrom = sub.state === "ACTIVE" || sub.state === "SUSPENDED" ? new Date(sub.endsAt) : new Date();
  const action = useAction(
    () =>
      api(`/api/platform/subscriptions/${sub.id}`, {
        method: "PATCH",
        body: {
          action: "renew",
          days: Number(days),
          price: Number(price),
          discount: Number(discount) || 0,
          payment: recordPayment ? { status: payment.paymentStatus, method: payment.method, reference: payment.reference || undefined } : null,
        },
      }),
    "Subscription renewed",
    onClose
  );
  return (
    <DialogShell
      wide
      title={`Renew ${sub.planName}`}
      description={`The new period starts ${fmtDate(startsFrom.toISOString())} and ends ${Number(days) > 0 ? addDaysLabel(startsFrom, Number(days)) : "—"}.`}
      error={action.error}
      busy={action.busy}
      submitLabel="Renew"
      submitDisabled={!(Number(days) > 0)}
      onSubmit={action.run}
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Duration (days)" htmlFor="renew-days">
          <input id="renew-days" type="number" min={1} className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label="Price (₹)" htmlFor="renew-price">
          <input id="renew-price" type="number" min={0} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Discount (₹)" htmlFor="renew-discount">
          <input id="renew-discount" type="number" min={0} className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
      </div>
      <p className="text-sm text-zinc-400">
        Final amount <b className="text-white">{money(Math.max(0, (Number(price) || 0) - (Number(discount) || 0)))}</b>
      </p>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <Switch checked={recordPayment} onCheckedChange={setRecordPayment} /> Record a payment now
      </label>
      {recordPayment && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PaymentFields idPrefix="renew" status={payment.paymentStatus} method={payment.method} reference={payment.reference} onChange={(patch) => setPayment((p) => ({ ...p, ...patch }))} />
        </div>
      )}
    </DialogShell>
  );
}

export function ExtendDialog({ sub, onClose }: { sub: SubscriptionRow; onClose: () => void }) {
  const [days, setDays] = useState("30");
  const base = sub.state === "EXPIRED" ? new Date() : new Date(sub.endsAt);
  const action = useAction(
    () => api(`/api/platform/subscriptions/${sub.id}`, { method: "PATCH", body: { action: "extend", days: Number(days) } }),
    "Subscription extended",
    onClose
  );
  return (
    <DialogShell
      title={`Extend ${sub.planName}`}
      description="Adds free days to this subscription without a new payment."
      error={action.error}
      busy={action.busy}
      submitLabel="Extend"
      submitDisabled={!(Number(days) > 0)}
      onSubmit={action.run}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-2">
        {[7, 15, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={Number(days) === d ? "default" : "outline"} onClick={() => setDays(String(d))}>
            +{d} days
          </Button>
        ))}
      </div>
      <Field label="Days to add" htmlFor="extend-days">
        <input id="extend-days" type="number" min={1} className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
      </Field>
      <p className="text-sm text-zinc-400">
        New end date <b className="text-white">{Number(days) > 0 ? addDaysLabel(base, Number(days)) : "—"}</b>
      </p>
    </DialogShell>
  );
}

export function RecordPaymentDialog({ sub, onClose }: { sub: SubscriptionRow; onClose: () => void }) {
  const paidSoFar = (sub.payments ?? []).filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.amount, 0);
  const [amount, setAmount] = useState(String(Math.max(0, sub.amount - paidSoFar) || sub.amount));
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState({ paymentStatus: "PAID" as "PAID" | "PENDING" | "FAILED", method: "UPI", reference: "" });
  const action = useAction(
    () =>
      api(`/api/platform/subscriptions/${sub.id}/payments`, {
        method: "POST",
        body: { amount: Number(amount), status: payment.paymentStatus, method: payment.method, reference: payment.reference || undefined, notes: notes || undefined },
      }),
    "Payment recorded",
    onClose
  );
  return (
    <DialogShell
      wide
      title={`Record payment — ${sub.planName}`}
      description={`Subscription amount ${money(sub.amount)}${paidSoFar > 0 ? ` · already paid ${money(paidSoFar)}` : ""}. A pending subscription activates once it is fully paid.`}
      error={action.error}
      busy={action.busy}
      submitLabel="Record payment"
      submitDisabled={!(Number(amount) >= 0) || amount === ""}
      onSubmit={action.run}
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)" htmlFor="pay-amount" className="sm:col-span-2">
          <input id="pay-amount" type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <PaymentFields idPrefix="pay" status={payment.paymentStatus} method={payment.method} reference={payment.reference} onChange={(patch) => setPayment((p) => ({ ...p, ...patch }))} />
        <Field label="Notes" htmlFor="pay-notes" className="sm:col-span-2">
          <textarea id="pay-notes" rows={2} className={`${inputCls} h-auto py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </DialogShell>
  );
}

type OpenDialog = null | "renew" | "extend" | "change" | "payment" | "suspend" | "resume" | "cancel";

/** Row / card action menu for one subscription. */
export function SubscriptionActions({
  sub,
  customerName,
  showCustomerLink = false,
  variant = "menu",
}: {
  sub: SubscriptionRow;
  customerName: string;
  showCustomerLink?: boolean;
  variant?: "menu" | "buttons";
}) {
  const { go } = useRoute();
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);
  const cancelled = sub.state === "CANCELLED";
  const canSuspend = sub.state === "ACTIVE" || sub.state === "PENDING";
  const canResume = (sub.state === "SUSPENDED" || sub.state === "PENDING") && new Date(sub.endsAt).getTime() > Date.now();
  const patch = (action: string) => api(`/api/platform/subscriptions/${sub.id}`, { method: "PATCH", body: { action } });

  const items: { key: OpenDialog; label: string; icon: typeof RefreshCw; show: boolean; danger?: boolean }[] = [
    { key: "renew", label: "Renew", icon: RefreshCw, show: !cancelled },
    { key: "extend", label: "Extend validity", icon: CalendarPlus, show: !cancelled },
    { key: "change", label: "Upgrade / downgrade", icon: Repeat, show: !cancelled },
    { key: "payment", label: "Record payment", icon: CreditCard, show: !cancelled },
    { key: "resume", label: sub.state === "PENDING" ? "Activate" : "Resume", icon: Play, show: canResume },
    { key: "suspend", label: "Suspend", icon: Pause, show: canSuspend },
    { key: "cancel", label: "Cancel subscription", icon: Ban, show: !cancelled, danger: true },
  ];

  return (
    <>
      {variant === "buttons" ? (
        <div className="flex flex-wrap gap-2">
          {items
            .filter((i) => i.show)
            .map((i) => (
              <Button key={i.key} size="sm" variant={i.danger ? "outline" : i.key === "renew" ? "default" : "outline"} className={i.danger ? "border-red-500/40 text-red-300 hover:bg-red-500/10" : undefined} onClick={() => setOpen(i.key)}>
                <i.icon className="mr-1.5 h-4 w-4" /> {i.label}
              </Button>
            ))}
        </div>
      ) : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" aria-label={`Actions for ${customerName}'s ${sub.planName} subscription`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {showCustomerLink && (
              <>
                <DropdownMenuItem onSelect={() => go("customers", { id: sub.customerId, query: { tab: "subscription" } })}>
                  <User className="mr-2 h-4 w-4" /> View customer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {items
              .filter((i) => i.show)
              .map((i) => (
                <DropdownMenuItem key={i.key} onSelect={() => setOpen(i.key)} className={i.danger ? "text-red-300 focus:text-red-200" : undefined}>
                  <i.icon className="mr-2 h-4 w-4" /> {i.label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {open === "renew" && <RenewDialog sub={sub} onClose={close} />}
      {open === "extend" && <ExtendDialog sub={sub} onClose={close} />}
      {open === "payment" && <RecordPaymentDialog sub={sub} onClose={close} />}
      {open === "change" && (
        <CreateSubscriptionDialog mode="change" customer={{ id: sub.customerId, name: customerName, organizationId: sub.organizationId }} onClose={close} />
      )}
      <ActionConfirm
        open={open === "suspend"}
        onClose={close}
        title="Suspend this subscription?"
        description={`${customerName} loses access to subscription channels until you resume it.`}
        confirmLabel="Suspend"
        destructive
        run={() => patch("suspend")}
        success="Subscription suspended"
      />
      <ActionConfirm
        open={open === "resume"}
        onClose={close}
        title={sub.state === "PENDING" ? "Activate this subscription?" : "Resume this subscription?"}
        description={`${customerName} gets access to the ${sub.planName} channels again until ${fmtDate(sub.endsAt)}.`}
        confirmLabel={sub.state === "PENDING" ? "Activate" : "Resume"}
        run={() => patch("resume")}
        success={sub.state === "PENDING" ? "Subscription activated" : "Subscription resumed"}
      />
      <ActionConfirm
        open={open === "cancel"}
        onClose={close}
        title="Cancel this subscription?"
        description={`${customerName} loses access immediately. This can't be undone — create a new subscription to restore access.`}
        confirmLabel="Cancel subscription"
        destructive
        run={() => patch("cancel")}
        success="Subscription cancelled"
      />
    </>
  );
}

export function ActionConfirm({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  destructive,
  run,
  success,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<unknown>;
  success: string;
}) {
  const queryClient = useQueryClient();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive={destructive}
      onConfirm={async () => {
        await run();
        toast.success(success);
        await queryClient.invalidateQueries({ queryKey: ["platform"] });
      }}
    />
  );
}
