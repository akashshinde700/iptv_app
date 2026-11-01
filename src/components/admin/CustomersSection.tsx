"use client";

/* Admin: Customers section — table, create/edit dialog, plan actions, preview, overrides. */

import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarPlus,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Eye,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createAdminCustomer,
  deleteAdminCustomer,
  fetchAdminCustomers,
  fetchAdminPlans,
  fetchCustomerPreview,
  updateAdminCustomer,
  type AccessPreview,
  type AdminCustomer,
  type AdminPlan,
} from "@/lib/admin-api";
import { daysLeft, fmtDate, fmtNumber, StatusBadge } from "./shared";

const STATUSES = ["ALL", "ACTIVE", "INACTIVE", "SUSPENDED", "EXPIRED"];

function CustomerFormDialog({
  open,
  onClose,
  customer,
  plans,
}: {
  open: boolean;
  onClose: () => void;
  customer: AdminCustomer | null;
  plans: AdminPlan[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(customer?.name ?? "");
  const [username, setUsername] = useState(customer?.username ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [mobile, setMobile] = useState(customer?.mobile ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(customer?.status ?? "ACTIVE");
  const [planId, setPlanId] = useState(customer?.planId ?? "none");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (customer) {
        return updateAdminCustomer(customer.id, {
          name,
          email,
          mobile,
          notes,
          status: status === "none" ? undefined : status,
          ...(password ? { password } : {}),
        });
      }
      return createAdminCustomer({
        name,
        username,
        email,
        mobile,
        password,
        status,
        planId: planId === "none" ? null : planId,
        notes,
      });
    },
    onSuccess: () => {
      toast.success(customer ? "Customer update ho gaya" : "Customer ban gaya ✅");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto bg-zinc-950 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{customer ? "Edit Customer" : "Naya Customer banao"}</DialogTitle>
        <DialogDescription>
          {customer ? "Details update karo. Password blank chhodo to change nahi hoga." : "Test ya real customer — dono ke liye same flow."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" />
        </div>
        {!customer && (
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="rahul01" />
            </div>
            <div className="grid gap-2">
              <Label>Password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 chars" />
            </div>
          </div>
        )}
        {customer && (
          <div className="grid gap-2">
            <Label>Naya Password (optional)</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="blank = no change" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@mail.com" />
          </div>
          <div className="grid gap-2">
            <Label>Mobile (optional)</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98xxxxxxxx" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950">
                {["ACTIVE", "INACTIVE", "SUSPENDED"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!customer && (
            <div className="grid gap-2">
              <Label>Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-950">
                  <SelectItem value="none">No plan (locked)</SelectItem>
                  {plans.filter((p) => p.isActive).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — ₹{p.price} / {p.durationDays}d
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <Label>Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Payment info, remark…" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : customer ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PreviewDialog({ customer, onClose }: { customer: AdminCustomer; onClose: () => void }) {
  const { data, isLoading } = useQuery<AccessPreview>({
    queryKey: ["customer-preview", customer.id],
    queryFn: () => fetchCustomerPreview(customer.id),
  });

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto bg-zinc-950 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Access Preview — {customer.name}</DialogTitle>
        <DialogDescription>Is customer ko abhi ye channels milenge (plan rules + overrides ke hisaab se).</DialogDescription>
      </DialogHeader>
      {isLoading && <p className="py-8 text-center text-zinc-500">Calculate ho raha hai…</p>}
      {data && (
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Total Accessible Channels</p>
            <p className="text-4xl font-bold text-emerald-400">{fmtNumber(data.total)}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {data.state.hasAccess
                ? `${data.state.planName} • Adult: ${data.state.allowAdult ? "ON" : "OFF"}`
                : `⛔ ${data.state.reason}`}
            </p>
          </div>
          {(["byRegion", "byCountry", "byLanguage", "byCategory"] as const).map((key) => {
            const labels = { byRegion: "Regions", byCountry: "Countries", byLanguage: "Languages", byCategory: "Categories" };
            return (
              <div key={key}>
                <p className="mb-1 text-xs font-medium text-zinc-400">{labels[key]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.breakdown[key].length === 0 && <span className="text-xs text-zinc-600">—</span>}
                  {data.breakdown[key].map((row) => (
                    <Badge key={row.key} variant="outline" className="border-zinc-700 text-zinc-300">
                      {key === "byCategory" ? row.key : row.key}: {fmtNumber(row.count)}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DialogContent>
  );
}

export function CustomersSection() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCustomer | null>(null);
  const [previewing, setPreviewing] = useState<AdminCustomer | null>(null);

  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: fetchAdminPlans,
  });

  const customersQuery = useQuery({
    queryKey: ["admin-customers", search, status, page],
    queryFn: () => fetchAdminCustomers({ search, status, page, pageSize: 15 }),
  });

  const action = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateAdminCustomer(id, body),
    onSuccess: () => {
      toast.success("Ho gaya ✅");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteAdminCustomer(id),
    onSuccess: () => {
      toast.success("Customer delete ho gaya");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = customersQuery.data?.items ?? [];
  const totalPages = customersQuery.data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name / username / email / mobile…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-zinc-950">
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="bg-emerald-600 hover:bg-emerald-500"
        >
          <Plus className="mr-1 h-4 w-4" /> Customer
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customersQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-zinc-500">Load ho raha hai…</TableCell>
              </TableRow>
            )}
            {!customersQuery.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-zinc-500">Koi customer nahi mila.</TableCell>
              </TableRow>
            )}
            {items.map((customer) => {
              const left = daysLeft(customer.planExpiresAt);
              return (
                <TableRow key={customer.id} className="border-zinc-800">
                  <TableCell>
                    <div className="font-medium text-zinc-100">{customer.name}</div>
                    <div className="text-xs text-zinc-500">@{customer.username} • {customer.email}</div>
                  </TableCell>
                  <TableCell><StatusBadge status={customer.status} /></TableCell>
                  <TableCell>
                    {customer.plan ? (
                      <span className="text-sm">{customer.plan.name}</span>
                    ) : (
                      <span className="text-xs text-zinc-600">No plan</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {customer.planExpiresAt ? (
                      <div>
                        <div className="text-sm">{fmtDate(customer.planExpiresAt).split(",")[0]}</div>
                        <div className={`text-xs ${left !== null && left < 7 ? "text-orange-400" : "text-zinc-500"}`}>
                          {left !== null && left >= 0 ? `${left} din bache` : "expired"}
                        </div>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">{fmtDate(customer.lastLoginAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Preview channels" onClick={() => setPreviewing(customer)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {customer.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Plan deactivate"
                          onClick={() => action.mutate({ id: customer.id, body: { action: "deactivate_plan" } })}
                        >
                          <Power className="h-4 w-4 text-orange-400" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Plan activate"
                          onClick={() => action.mutate({ id: customer.id, body: { action: "activate_plan" } })}
                        >
                          <RotateCcw className="h-4 w-4 text-emerald-400" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Renew (plan duration add)"
                        onClick={() => action.mutate({ id: customer.id, body: { action: "renew" } })}
                      >
                        <RefreshCw className="h-4 w-4 text-sky-400" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="+30 days extend"
                        onClick={() => action.mutate({ id: customer.id, body: { action: "extend", extendDays: 30 } })}
                      >
                        <CalendarPlus className="h-4 w-4 text-sky-400" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Edit"
                        onClick={() => { setEditing(customer); setFormOpen(true); }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete"
                        onClick={() => {
                          if (confirm(`${customer.name} ko delete karein?`)) del.mutate(customer.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span className="text-sm text-zinc-500">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        {formOpen && (
          <CustomerFormDialog
            key={editing?.id ?? "new"}
            open={formOpen}
            onClose={() => setFormOpen(false)}
            customer={editing}
            plans={plansQuery.data?.items ?? []}
          />
        )}
      </Dialog>

      <Dialog open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        {previewing && <PreviewDialog customer={previewing} onClose={() => setPreviewing(null)} />}
      </Dialog>
    </div>
  );
}
