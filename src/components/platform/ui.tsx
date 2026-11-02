"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Inbox, Loader2, RefreshCw, Search as SearchIcon, X, type LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, withQuery, type OrgRow, type PlanRow } from "./api";

/* ------------------------------- formatting ------------------------------- */

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function money(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const platform = /Android TV|AFT[A-Z]|BRAVIA|GoogleTV|SmartTV|Tizen|Web0S|webOS/i.test(ua)
    ? "TV"
    : /Electron/i.test(ua)
      ? "Windows app"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad/i.test(ua)
          ? "iPhone / iPad"
          : /Windows/i.test(ua)
            ? "Windows browser"
            : /Mac OS/i.test(ua)
              ? "Mac"
              : "Browser";
  return platform;
}

/* --------------------------------- status --------------------------------- */

const PILLS: Record<string, [string, string]> = {
  // customer / subscription states
  ACTIVE: ["Active", "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"],
  EXPIRED: ["Expired", "border-red-500/40 bg-red-500/10 text-red-300"],
  PENDING: ["Pending", "border-sky-500/40 bg-sky-500/10 text-sky-300"],
  SUSPENDED: ["Suspended", "border-orange-500/40 bg-orange-500/10 text-orange-300"],
  CANCELLED: ["Cancelled", "border-zinc-600 bg-zinc-800/60 text-zinc-300"],
  NO_SUBSCRIPTION: ["No active subscription", "border-zinc-600 bg-zinc-800/60 text-zinc-300"],
  ARCHIVED: ["Archived", "border-zinc-700 bg-zinc-900 text-zinc-500"],
  // payment
  PAID: ["Paid", "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"],
  PARTIALLY_PAID: ["Partly paid", "border-amber-500/40 bg-amber-500/10 text-amber-300"],
  NOT_RECORDED: ["Not recorded", "border-zinc-600 bg-zinc-800/60 text-zinc-400"],
  FAILED: ["Failed", "border-red-500/40 bg-red-500/10 text-red-300"],
  REFUNDED: ["Refunded", "border-violet-500/40 bg-violet-500/10 text-violet-300"],
  // organization
  TRIAL: ["Trial", "border-sky-500/40 bg-sky-500/10 text-sky-300"],
  PAST_DUE: ["Past due", "border-amber-500/40 bg-amber-500/10 text-amber-300"],
};

export function StatePill({ value, className }: { value: string; className?: string }) {
  const [label, cls] = PILLS[value] ?? [value, "border-zinc-700 bg-zinc-900 text-zinc-300"];
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", cls, className)}>
      {label}
    </span>
  );
}

export function DaysLeft({ days, state }: { days: number | null; state?: string }) {
  if (days === null) return <span className="text-zinc-500">—</span>;
  if (state === "CANCELLED") return <span className="text-zinc-500">—</span>;
  if (days < 0) return <span className="text-red-300">Ended {Math.abs(days)} {Math.abs(days) === 1 ? "day" : "days"} ago</span>;
  if (days === 0) return <span className="text-amber-300">Ends today</span>;
  return (
    <span className={days <= 7 ? "text-amber-300" : "text-zinc-400"}>
      {days} {days === 1 ? "day" : "days"} left
    </span>
  );
}

/* --------------------------------- layout --------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mb-5">
      {back && (
        <button onClick={back.onClick} className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100">
          <ChevronLeft className="h-4 w-4" /> {back.label}
        </button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-zinc-800 bg-zinc-900/40", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Icon className="h-9 w-9 text-zinc-600" aria-hidden />
      <p className="font-medium text-zinc-200">{title}</p>
      {message && <p className="max-w-md text-sm text-zinc-500">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{error instanceof Error ? error.message : "Something went wrong."}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function TableShell({ children, minWidth = 760 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  sticky,
}: {
  children?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <th
      className={cn(
        "bg-zinc-900/70 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500",
        // RSP-02: keep the identifying column in view while the rest scrolls on a phone.
        sticky && "sticky left-0 z-10",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  sticky,
}: {
  children?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-t border-zinc-800/70 px-3 py-2.5 align-middle",
        sticky && "sticky left-0 z-10 bg-zinc-950",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-zinc-800 p-3" aria-busy>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className="h-6" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
      <span>
        {total.toLocaleString("en-IN")} {total === 1 ? "result" : "results"}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
            value === o.value ? "border-amber-500 bg-amber-500/15 text-amber-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs text-zinc-400">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export const inputCls = "h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500";

/* ------------------------------ confirmation ------------------------------ */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && (setError(null), onOpenChange(next))}>
      <AlertDialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Something went wrong.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------ shared data ------------------------------ */

export function useOrgs() {
  return useQuery({
    queryKey: ["platform", "orgs", "all"],
    queryFn: () => api<{ items: OrgRow[] }>("/api/platform/orgs").then((r) => r.items),
    staleTime: 60_000,
  });
}

export function usePlans(organizationId?: string) {
  return useQuery({
    queryKey: ["platform", "plans", organizationId ?? "all"],
    queryFn: () => api<{ items: PlanRow[] }>(withQuery("/api/platform/plans", { organizationId })).then((r) => r.items),
    staleTime: 30_000,
  });
}

export function OrgSelect({
  value,
  onChange,
  allowAll = true,
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  className?: string;
  id?: string;
}) {
  const orgs = useOrgs();
  return (
    <Select value={value || (allowAll ? "ALL" : "")} onValueChange={onChange}>
      <SelectTrigger id={id} className={cn("h-9 min-w-[11rem] border-zinc-700 bg-zinc-950", className)} aria-label="Organization">
        <SelectValue placeholder={orgs.isLoading ? "Loading…" : "Choose organization"} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="ALL">All organizations</SelectItem>}
        {(orgs.data ?? []).map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Searchable multi-select with chips, select-all/clear, and a live count. */
export function SearchMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  emptyText = "No options",
  id,
}: {
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  emptyText?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const labelFor = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  const selectedSet = new Set(selected);
  const toggle = (v: string) => onChange(selectedSet.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <PopoverTrigger asChild>
          <button type="button" id={id} aria-expanded={open} className={cn(inputCls, "flex items-center justify-between text-left")}>
            <span className="truncate text-zinc-300">{selected.length > 0 ? `${selected.length} selected` : placeholder}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,80vw)] border-zinc-700 bg-zinc-950 p-2">
          <div className="relative mb-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden />
            <input autoFocus className={cn(inputCls, "h-8 pl-8 text-sm")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
          </div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <button type="button" className="text-amber-300 hover:underline" onClick={() => onChange([...new Set([...selected, ...filtered.map((o) => o.value)])])}>
              Select all{q ? " shown" : ""}
            </button>
            <button type="button" className="text-zinc-400 hover:underline" onClick={() => onChange([])}>
              Clear all
            </button>
          </div>
          <div className="thin-scrollbar max-h-56 space-y-0.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-zinc-500">{emptyText}</p>
            ) : (
              filtered.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-800/70">
                  <input type="checkbox" checked={selectedSet.has(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 accent-amber-500" />
                  <span className="flex-1 truncate text-zinc-200">{o.label}</span>
                  {o.count != null && <span className="text-xs tabular-nums text-zinc-500">{o.count.toLocaleString("en-IN")}</span>}
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
              {labelFor.get(v) ?? v}
              <button type="button" onClick={() => toggle(v)} aria-label={`Remove ${labelFor.get(v) ?? v}`} className="hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
