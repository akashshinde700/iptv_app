"use client";

/* Shared bits for the admin panel: badges, formatters, multi-select dropdown. */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ListFilter, Loader2, RotateCw } from "lucide-react";
import { useState } from "react";

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

export function daysLeft(value: string | null | undefined): number | null {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    INACTIVE: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    SUSPENDED: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    EXPIRED: "bg-red-500/15 text-red-400 border-red-500/30",
    ERROR: "bg-red-500/15 text-red-400 border-red-500/30",
    PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    SYNCING: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    SUCCESS: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };
  return (
    <Badge variant="outline" className={map[status] ?? map.INACTIVE}>
      {status}
    </Badge>
  );
}

export const PORTAL_TYPE_LABEL: Record<string, string> = {
  STALKER: "📡 Stalker (MAC)",
  XTREAM: "🔗 Xtream",
  M3U_URL: "🔗 M3U Link",
  M3U_FILE: "📁 M3U File",
};

export interface MultiSelectOption {
  value: string;
  label: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  className,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`justify-between font-normal ${className ?? ""}`}>
          <span className="truncate">
            {selected.length > 0 ? `${selected.length} selected` : placeholder}
          </span>
          <ListFilter className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-h-80 overflow-y-auto p-2" align="start">
        {options.length === 0 && <p className="p-2 text-sm text-muted-foreground">No options</p>}
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => toggle(option.value)} />
            <span className="flex-1 truncate">{option.label}</span>
            {selected.includes(option.value) && <Check className="h-3.5 w-3.5 text-primary" />}
          </label>
        ))}
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>
            Clear selection
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A destructive action behind a real dialog instead of `window.confirm()`.
 *
 * `confirm()` is unstyled, blocks the main thread, is untranslatable, tears the PWA out of
 * standalone mode on iOS, and cannot be driven from a TV remote — yet it guarded four of the
 * most destructive admin actions (bulk channel delete, customer/plan/portal delete). This wraps
 * the existing `ui/alert-dialog` so those actions get a consistent, focus-trapped confirmation.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  disabled,
  onConfirm,
  children,
  className,
  size = "sm",
  variant = "ghost",
  titleAttr,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  titleAttr?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size={size} variant={variant} className={className} disabled={disabled} title={titleAttr}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-red-600 text-white hover:bg-red-500" : undefined}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The three states every async table row-set must distinguish (UX-02).
 *
 * Before this, a failed fetch and an empty result rendered the same "Koi … nahi" row, so an
 * expired session or a 500 looked exactly like "this organization has no customers yet" — and the
 * operator had no retry. `isError` was not read anywhere in the admin panel.
 */
export function TableState({
  colSpan,
  isLoading,
  isError,
  error,
  onRetry,
  empty,
  isEmpty = false,
}: {
  colSpan: number;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty: React.ReactNode;
  isEmpty?: boolean;
}) {
  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-zinc-500">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </TableCell>
      </TableRow>
    );
  }

  if (isError) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Data load nahi ho paaya — connection ya session check karo.";
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-8 text-center">
          <p className="text-sm font-medium text-red-400">Kuch galat ho gaya</p>
          <p className="mt-1 text-xs text-zinc-500">{message}</p>
          {onRetry && (
            <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Dobara try karo
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  }

  if (isEmpty) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-zinc-500">
          {empty}
        </TableCell>
      </TableRow>
    );
  }

  return null;
}
