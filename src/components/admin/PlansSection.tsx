"use client";

/* Admin: Plans section — create/edit rules (region/country/language/category), activate/deactivate. */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createAdminPlan,
  deleteAdminPlan,
  fetchAdminMeta,
  fetchAdminPlans,
  updateAdminPlan,
  type AdminPlan,
} from "@/lib/admin-api";
import { MultiSelect, fmtNumber, ConfirmButton, TableState } from "./shared";

function PlanFormDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan: AdminPlan | null;
}) {
  const queryClient = useQueryClient();
  const metaQuery = useQuery({ queryKey: ["admin-meta"], queryFn: fetchAdminMeta });

  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(String(plan?.price ?? 49));
  const [durationDays, setDurationDays] = useState(String(plan?.durationDays ?? 30));
  const [maxDevices, setMaxDevices] = useState(String(plan?.maxDevices ?? 1));
  const [allowAdult, setAllowAdult] = useState(plan?.allowAdult ?? false);
  const [regions, setRegions] = useState<string[]>(plan?.regions ?? []);
  const [countries, setCountries] = useState<string[]>(plan?.countries ?? []);
  const [languages, setLanguages] = useState<string[]>(plan?.languages ?? []);
  const [categories, setCategories] = useState<string[]>(plan?.categories ?? []);
  const [formError, setFormError] = useState<string | null>(null);

  /** UX-07: catch empty/invalid numbers here instead of letting the API 400 after a round-trip. */
  const validationError = (() => {
    if (!name.trim()) return "Plan name likho";
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) return "Price 0 ya usse zyada honi chahiye";
    const d = Number(durationDays);
    if (!Number.isInteger(d) || d < 1 || d > 3650) return "Duration 1 se 3650 din ke beech";
    const m = Number(maxDevices);
    if (!Number.isInteger(m) || m < 1 || m > 20) return "Max devices 1 se 20 ke beech";
    return null;
  })();

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        description,
        price: Number.parseInt(price, 10) || 0,
        durationDays: Number.parseInt(durationDays, 10) || 30,
        maxDevices: Number.parseInt(maxDevices, 10) || 1,
        allowAdult,
        regions,
        countries,
        languages,
        categories,
      };
      return plan ? updateAdminPlan(plan.id, body) : createAdminPlan(body);
    },
    onSuccess: () => {
      toast.success(plan ? "Plan update ho gaya" : "Plan ban gaya ✅");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      onClose();
    },
    onError: (error: Error) => {
      setFormError(error.message);
      toast.error(error.message);
    },
  });

  const meta = metaQuery.data;
  const countryOptions = (meta?.countries ?? []).map((c) => ({ value: c.code, label: c.name }));
  const catLabel = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto bg-zinc-950 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{plan ? "Edit Plan" : "Naya Plan banao"}</DialogTitle>
        <DialogDescription>
          Rules khali chhoda to us dimension pe sab channels milenge. Adult OFF = xxx channels kabhi nahi dikhenge.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Plan Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Premium Monthly" />
          </div>
          <div className="grid gap-2">
            <Label>Price (₹)</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Duration (days)</Label>
            <Input value={durationDays} onChange={(e) => setDurationDays(e.target.value)} inputMode="numeric" />
          </div>
          <div className="grid gap-2">
            <Label>Max Devices</Label>
            <Input value={maxDevices} onChange={(e) => setMaxDevices(e.target.value)} inputMode="numeric" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="rounded-lg border border-zinc-800 p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Channel Access Rules</p>
          <div className="grid grid-cols-2 gap-3">
            <MultiSelect
              placeholder="Regions"
              options={(meta?.regions ?? []).map((r) => ({ value: r, label: r }))}
              selected={regions}
              onChange={setRegions}
            />
            <MultiSelect
              placeholder="Countries"
              options={countryOptions}
              selected={countries}
              onChange={setCountries}
            />
            <MultiSelect
              placeholder="Languages"
              options={(meta?.languages ?? []).map((l) => ({ value: l, label: l }))}
              selected={languages}
              onChange={setLanguages}
            />
            <MultiSelect
              placeholder="Categories"
              options={(meta?.categories ?? []).map((c) => ({ value: c, label: catLabel(c) }))}
              selected={categories}
              onChange={setCategories}
            />
          </div>
          <div className="flex items-center justify-between rounded-md bg-zinc-900 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Adult Content Access</p>
              <p className="text-xs text-zinc-500">OFF rakho to adult channels kabhi assign nahi honge</p>
            </div>
            <Switch checked={allowAdult} onCheckedChange={setAllowAdult} />
          </div>
        </div>
      </div>
      {formError && <p className="text-xs text-red-400">{formError}</p>}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => {
            if (validationError) {
              setFormError(validationError);
              return;
            }
            setFormError(null);
            save.mutate();
          }}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : plan ? "Save" : "Create Plan"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function PlansSection() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPlan | null>(null);

  const plansQuery = useQuery({ queryKey: ["admin-plans"], queryFn: fetchAdminPlans });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAdminPlan(id, { isActive }),
    onSuccess: () => {
      toast.success("Plan status badal gaya");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteAdminPlan(id),
    onSuccess: () => {
      toast.success("Plan delete ho gaya");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = plansQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500">
          <Plus className="mr-1 h-4 w-4" /> Plan
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead>Plan</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Access Rules</TableHead>
              <TableHead>Adult</TableHead>
              <TableHead>Customers</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableState
              colSpan={8}
              isLoading={plansQuery.isLoading}
              isError={plansQuery.isError}
              error={plansQuery.error}
              onRetry={() => plansQuery.refetch()}
              isEmpty={items.length === 0}
              empty="Koi plan nahi — pehla plan banao."
            />
            {items.map((plan) => (
              <TableRow key={plan.id} className="border-zinc-800">
                <TableCell>
                  <div className="font-medium text-zinc-100">{plan.name}</div>
                  {plan.description && <div className="max-w-48 truncate text-xs text-zinc-500">{plan.description}</div>}
                </TableCell>
                <TableCell>₹{plan.price}</TableCell>
                <TableCell>{plan.durationDays}d</TableCell>
                <TableCell>
                  <div className="flex max-w-64 flex-wrap gap-1 text-xs text-zinc-400">
                    <span>{plan.regions.length ? `🌍 ${plan.regions.join(", ")}` : "🌍 All"}</span>
                    <span>{plan.countries.length ? `• 🏳 ${plan.countries.join(", ")}` : ""}</span>
                    <span>{plan.languages.length ? `• 🗣 ${plan.languages.join(", ")}` : ""}</span>
                    <span>{plan.categories.length ? `• 📺 ${plan.categories.length}` : ""}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {plan.allowAdult ? (
                    <span className="text-purple-400">ON</span>
                  ) : (
                    <span className="text-zinc-500">OFF</span>
                  )}
                </TableCell>
                <TableCell>{fmtNumber(plan.customerCount)}</TableCell>
                <TableCell>
                  <span className={plan.isActive ? "text-emerald-400" : "text-red-400"}>
                    {plan.isActive ? "🟢 Active" : "🔴 Inactive"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title={plan.isActive ? "Deactivate" : "Activate"}
                      onClick={() => toggleActive.mutate({ id: plan.id, isActive: !plan.isActive })}
                    >
                      <Power className={`h-4 w-4 ${plan.isActive ? "text-orange-400" : "text-emerald-400"}`} />
                    </Button>
                    <Button size="sm" variant="ghost" title="Edit" onClick={() => { setEditing(plan); setFormOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <ConfirmButton
                      titleAttr="Delete"
                      title={`Delete the plan “${plan.name}”?`}
                      description="Customers on this plan lose access when it is removed. Move them to another plan first if you can."
                      onConfirm={() => del.mutate(plan.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </ConfirmButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        {formOpen && (
          <PlanFormDialog key={editing?.id ?? "new"} open={formOpen} onClose={() => setFormOpen(false)} plan={editing} />
        )}
      </Dialog>
    </div>
  );
}
