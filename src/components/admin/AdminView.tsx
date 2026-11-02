"use client";

/* Admin Panel — login gate + sidebar shell + section switching.
   Access: TopNav lock button, footer link, ya #admin hash. */

import { Button } from "@/components/ui/button";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Layers,
  FileClock,
  HeartPulse,
  LayoutDashboard,
  Lock,
  LogOut,
  Radio,
  Settings,
  ShieldCheck,
  Tv,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  adminChangePassword,
  adminLogin,
  adminLogout,
  adminMe,
  fetchAuditLogs,
} from "@/lib/admin-api";
import { AdminDashboard } from "./AdminDashboard";
import { ChannelsSection } from "./ChannelsSection";
import { SourcesSection } from "./SourcesSection";
import { CustomersSection } from "./CustomersSection";
import { PlansSection } from "./PlansSection";
import { PortalsSection } from "./PortalsSection";
import { HealthSection } from "./HealthSection";
import { fmtDate } from "./shared";

type Section =
  | "dashboard"
  | "health"
  | "failover"
  | "sources"
  | "channels"
  | "customers"
  | "plans"
  | "audit"
  | "settings";

const BASE_DOMAIN = process.env.NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN || "streamkaro.app";

/**
 * Ordered the way an operator actually works: my content sources → is it healthy → what do
 * customers watch → who pays me. The old menu had two near-identical "sources" entries
 * ("Failover Sources" and "Stalker Portals") which was the single most confusing thing here.
 */
const NAV: { key: Section; label: string; icon: React.ComponentType<{ className?: string }>; hint?: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "sources", label: "My sources", icon: Radio, hint: "M3U · Xtream · Stalker" },
  { key: "health", label: "Auto-fix", icon: HeartPulse, hint: "dead channels" },
  { key: "channels", label: "Channels", icon: Tv },
  { key: "failover", label: "Channel sources", icon: Layers, hint: "per channel" },
  { key: "customers", label: "Customers", icon: Users },
  { key: "plans", label: "Plans", icon: Wallet },
  { key: "audit", label: "Audit Logs", icon: FileClock },
  { key: "settings", label: "Settings", icon: Settings },
];

/** Kept so an old "#admin#portals" deep link still lands somewhere sensible. */
const LEGACY_SECTION: Record<string, Section> = { portals: "sources" };

function AdminLogin() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => adminLogin(username, password),
    onSuccess: () => {
      toast.success("Admin login ho gaya ✅");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16">
      <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
            <Lock className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white">StreamKaro Admin</h1>
          <p className="text-center text-sm text-zinc-500">Control panel — sirf admins ke liye</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="admin-user">Username ya Email</Label>
            <Input
              id="admin-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-pass">Password</Label>
            <Input
              id="admin-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-500" disabled={login.isPending}>
            {login.isPending ? "Login ho raha hai…" : "Login karo"}
          </Button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-zinc-600">
        Password bhool gaye? Apne StreamKaro provider se reset karwaayein.
      </p>
    </div>
  );
}

function AuditSection() {
  const [page, setPage] = useState(1);
  const logsQuery = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: () => fetchAuditLogs({ page, pageSize: 25 }),
  });

  const items = logsQuery.data?.items ?? [];
  const totalPages = logsQuery.data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead>Time</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Old → New</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-zinc-500">Load ho raha hai…</TableCell>
              </TableRow>
            )}
            {!logsQuery.isLoading && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-zinc-500">Koi audit log nahi.</TableCell>
              </TableRow>
            )}
            {items.map((log) => (
              <TableRow key={log.id} className="border-zinc-800">
                <TableCell className="whitespace-nowrap text-xs text-zinc-400">{fmtDate(log.createdAt)}</TableCell>
                <TableCell className="text-sm">{log.adminName}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-amber-300">{log.action}</span>
                </TableCell>
                <TableCell className="text-xs text-zinc-400">{log.entityType ?? "—"}</TableCell>
                <TableCell className="max-w-72">
                  <div className="truncate text-xs text-zinc-500">{log.oldValue ?? "—"}</div>
                  <div className="truncate text-xs text-zinc-400">{log.newValue ?? "—"}</div>
                </TableCell>
                <TableCell className="text-xs text-zinc-600">{log.ip ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-zinc-500">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function SettingsSection({
  admin,
  org,
}: {
  admin: { username: string; email: string; role: string };
  org: import("@/lib/admin-api").AdminOrg | null;
}) {
  return (
    <div className="max-w-xl space-y-4">
      {org && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-zinc-200">
            <ShieldCheck className="h-4 w-4 text-amber-400" /> Organization
          </h3>
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-zinc-500">Name</dt>
            <dd className="text-zinc-200">{org.name}</dd>
            <dt className="text-zinc-500">Storefront</dt>
            <dd className="text-amber-300">{org.slug}.{BASE_DOMAIN}</dd>
            <dt className="text-zinc-500">Status</dt>
            <dd className="text-zinc-200">{org.status}</dd>
            <dt className="text-zinc-500">Platform plan</dt>
            <dd className="text-zinc-200">{org.platformPlan}</dd>
            {org.platformValidUntil && (
              <>
                <dt className="text-zinc-500">Valid until</dt>
                <dd className="text-zinc-200">{fmtDate(org.platformValidUntil)}</dd>
              </>
            )}
          </dl>
        </div>
      )}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <h3 className="mb-2 flex items-center gap-2 font-semibold text-zinc-200">
          <ShieldCheck className="h-4 w-4 text-emerald-400" /> Admin Account
        </h3>
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-zinc-500">Username</dt>
          <dd className="text-zinc-200">{admin.username}</dd>
          <dt className="text-zinc-500">Email</dt>
          <dd className="text-zinc-200">{admin.email}</dd>
          <dt className="text-zinc-500">Role</dt>
          <dd className="text-zinc-200">{admin.role}</dd>
        </dl>
      </div>
      <ChangePasswordCard />
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
        <h3 className="mb-2 font-semibold text-zinc-200">Security</h3>
        <ul className="list-inside list-disc space-y-1 text-xs">
          <li>Passwords scrypt-hashed hain — plain text kabhi store nahi hota.</li>
          <li>Session 7 din me auto-expire, httpOnly cookie.</li>
          <li>Adult content aur plan gating server-side enforce hoti hai.</li>
          <li>Admin login pe rate limiting (10 attempts/min).</li>
        </ul>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => adminChangePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      toast.success("Password badal gaya — baaki devices se logout ho gaya");
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-zinc-200">
        <Lock className="h-4 w-4 text-amber-400" /> Change password
      </h3>
      <p className="mb-3 text-xs text-zinc-500">
        Kam se kam 8 characters, aur letters ke saath number ya symbol. Badalne ke baad baaki har
        device se logout ho jaayega.
      </p>
      <form
        className="grid max-w-sm gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (newPassword !== confirmPassword) {
            setError("Naya password dono jagah same hona chahiye");
            return;
          }
          setError(null);
          mutation.mutate();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="pw-current">Purana password</Label>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pw-new">Naya password</Label>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pw-confirm">Naya password (dobara)</Label>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Button
          type="submit"
          size="sm"
          className="w-full bg-amber-600 hover:bg-amber-500"
          disabled={mutation.isPending || !currentPassword || newPassword.length < 8}
        >
          {mutation.isPending ? "Badal raha hai…" : "Password badlo"}
        </Button>
      </form>
    </div>
  );
}

export function AdminView() {
  const navigate = useAppStore((s) => s.navigate);
  const meQuery = useQuery({ queryKey: ["admin-me"], queryFn: adminMe });
  const queryClient = useQueryClient();

  // A 401 from any admin call (session expired / cookie cleared) drops us back to the login form
  // instead of leaving the panel on a dead screen.
  useEffect(() => {
    const onExpired = () => {
      queryClient.setQueryData(["admin-me"], { admin: null, organization: null });
      toast.error("Session khatam — dobara login karo");
    };
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  // support #admin#section deep links (lazy init from hash — no effect needed)
  const [section, setSection] = useState<Section>(() => {
    if (typeof window === "undefined") return "dashboard";
    const match = window.location.hash.match(/^#admin#?(\w+)?/);
    const raw = match?.[1] ?? "";
    const key = (LEGACY_SECTION[raw] ?? raw) as Section;
    const found = NAV.find((n) => n.key === key);
    return found?.key ?? "dashboard";
  });

  if (meQuery.isLoading) {
    return <div className="py-24 text-center text-zinc-500">Checking session…</div>;
  }

  const admin = meQuery.data?.admin ?? null;
  const org = meQuery.data?.organization ?? null;
  if (!admin) return <AdminLogin />;

  const trialLeft =
    org?.platformTrialEndsAt && new Date(org.platformTrialEndsAt) > new Date()
      ? Math.ceil((new Date(org.platformTrialEndsAt).getTime() - Date.now()) / 86400000)
      : null;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => navigate({ name: "home" })}>
            <ChevronLeft className="h-4 w-4" /> Site
          </Button>
          <h1 className="text-lg font-bold text-white">
            {org?.name ?? "Admin Panel"}{" "}
            <span className="text-sm font-normal text-zinc-500">— {admin.username}</span>
          </h1>
          {org && (
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
              {org.slug}.{BASE_DOMAIN}
            </span>
          )}
          {trialLeft !== null && (
            <span className="rounded-full border border-sky-800 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
              Trial · {trialLeft}d left
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await adminLogout();
            toast.success("Logout ho gaya");
            queryClientClear();
          }}
        >
          <LogOut className="mr-1 h-4 w-4" /> Logout
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar */}
        <nav className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-1.5 lg:w-56 lg:flex-col lg:overflow-visible">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                  section === item.key
                    ? "bg-amber-500/15 font-medium text-amber-300"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex min-w-0 flex-col text-left leading-tight">
                  <span>{item.label}</span>
                  {"hint" in item && item.hint ? (
                    <span className="hidden text-[10px] font-normal text-zinc-500 lg:block">{item.hint}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Section content */}
        <div className="min-w-0 flex-1">
          {section === "dashboard" && <AdminDashboard onNavigate={(s) => setSection(s as Section)} />}
          {section === "customers" && <CustomersSection />}
          {section === "plans" && <PlansSection />}
          {section === "health" && <HealthSection onOpenChannels={() => setSection("failover")} />}
          {section === "sources" && <PortalsSection />}
          {section === "channels" && <ChannelsSection />}
          {section === "failover" && <SourcesSection />}
          {section === "audit" && <AuditSection />}
          {section === "settings" && <SettingsSection admin={admin} org={org} />}
        </div>
      </div>
    </div>
  );
}

function queryClientClear() {
  // full reload is the simplest reliable way to reset every admin query
  window.location.reload();
}
