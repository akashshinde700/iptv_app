"use client";

/* Profile / login — split login screen (form + plans) for guests, account status for customers. */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MonitorSmartphone,
  ServerCrash,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tv,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate } from "@/components/admin/shared";
import { PlanCard, PlansSkeleton, usePlans } from "@/components/tv/Plans";
import { StateView, describeError } from "@/components/tv/StateView";
import { useAppStore, useIsTv } from "@/lib/store";
import { useMe, type CustomerInfo } from "@/lib/use-me";
import { cn } from "@/lib/utils";

export function AccountView() {
  const me = useMe();

  if (me.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Loading your account" />
      </div>
    );
  }

  if (me.isError) {
    const described = describeError(me.error, "We couldn't check your account.");
    return (
      <StateView icon={described.icon} tone="error" title={described.title} message={described.message}>
        <Button className="rounded-full" data-autofocus onClick={() => me.refetch()}>
          Try again
        </Button>
      </StateView>
    );
  }

  const customer = me.data?.customer ?? null;
  return customer ? (
    <ProfilePanel customer={customer} hasAccess={me.data?.access.hasAccess ?? false} reason={me.data?.access.reason ?? ""} />
  ) : (
    <LoginScreen />
  );
}

/* ---------------------------------- Login ---------------------------------- */

type LoginField = "username" | "password" | "submit";

interface LoginProblem {
  icon: LucideIcon;
  title: string;
  message: string;
  focus: LoginField;
  showPlans?: boolean;
}

class LoginError extends Error {
  constructor(
    public status: number,
    message: string,
    public accountStatus?: string
  ) {
    super(message);
  }
}

/** Server / network failure → a message readable from the sofa + where focus should go. */
function explainLoginError(error: unknown): LoginProblem {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { icon: WifiOff, title: "No internet connection", message: "Connect to the internet and try again.", focus: "submit" };
  }
  if (error instanceof LoginError) {
    const { status, accountStatus } = error;
    if (status === 400) return { icon: AlertTriangle, title: "Enter your login ID and password", message: error.message, focus: "username" };
    if (status === 401) {
      return {
        icon: Lock,
        title: "Incorrect login ID or password",
        message: "Check the details from your provider and try again. Passwords are case-sensitive.",
        focus: "password",
      };
    }
    if (status === 429) {
      return { icon: Clock, title: "Too many attempts", message: "For your security, wait a minute before trying again.", focus: "submit" };
    }
    if (status === 403 && accountStatus === "EXPIRED") {
      return {
        icon: CalendarClock,
        title: "Subscription expired",
        message: "Your plan has ended. Renew it with your provider to keep watching.",
        focus: "submit",
        showPlans: true,
      };
    }
    if (status === 403 && accountStatus === "SUSPENDED") {
      return { icon: ShieldAlert, title: "Account blocked", message: "This account has been suspended. Please contact your provider.", focus: "submit" };
    }
    if (status === 403 && accountStatus === "INACTIVE") {
      return { icon: ShieldAlert, title: "Account inactive", message: "This account isn't active yet. Please contact your provider.", focus: "submit" };
    }
    if (status === 403) return { icon: ServerCrash, title: "Service unavailable", message: error.message, focus: "submit" };
    if (status >= 500) {
      return {
        icon: ServerCrash,
        title: "Server unavailable",
        message: "We couldn't reach the login service. Please try again in a moment.",
        focus: "submit",
      };
    }
    return { icon: AlertTriangle, title: "Couldn't log in", message: error.message, focus: "submit" };
  }
  return {
    icon: WifiOff,
    title: "Network error",
    message: "We couldn't reach StreamKaro. Check your connection and try again.",
    focus: "submit",
  };
}

function LoginScreen() {
  const queryClient = useQueryClient();
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [problem, setProblem] = useState<LoginProblem | null>(null);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const focusField = (field: LoginField) =>
    requestAnimationFrame(() => {
      if (field === "username") userRef.current?.focus();
      else if (field === "password") {
        passRef.current?.focus();
        passRef.current?.select();
      } else submitRef.current?.focus();
    });

  const login = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new LoginError(res.status, data.error ?? "Login failed", data.status);
      return data as { devicesKicked?: number; customer?: { name?: string } };
    },
    onSuccess: async (data) => {
      setProblem(null);
      toast.success(`Welcome${data.customer?.name ? `, ${data.customer.name}` : ""}!`);
      if (data.devicesKicked) {
        toast.info(
          `Signed out ${data.devicesKicked} older ${data.devicesKicked === 1 ? "device" : "devices"} to stay within your plan.`
        );
      }
      await queryClient.invalidateQueries();
      navigate({ name: "home" });
    },
    onError: (error) => {
      const next = explainLoginError(error);
      setProblem(next);
      focusField(next.focus);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login.isPending) return;
    if (!username.trim()) {
      setProblem({ icon: AlertTriangle, title: "Enter your login ID", message: "Type the username or email your provider gave you.", focus: "username" });
      focusField("username");
      return;
    }
    if (!password) {
      setProblem({ icon: AlertTriangle, title: "Enter your password", message: "Type the password for this login ID.", focus: "password" });
      focusField("password");
      return;
    }
    login.mutate();
  };

  const label = isTv ? "text-lg" : "text-sm";
  const field = cn("rounded-xl bg-muted/40", isTv ? "h-16 px-5 text-2xl" : "h-12 text-base");

  return (
    <div className={cn("mx-auto grid max-w-6xl items-start gap-6", isTv ? "grid-cols-2 gap-10" : "lg:grid-cols-2 lg:gap-10")}>
      <section aria-labelledby="login-title" className="rounded-3xl border border-border/60 bg-card/60 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
          <span className="text-xl font-extrabold tracking-tight text-brand-gradient">StreamKaro</span>
        </div>
        <h1 id="login-title" className={cn("mt-6 font-extrabold tracking-tight", isTv ? "text-4xl" : "text-3xl")}>
          Welcome back
        </h1>
        <p className={cn("mt-2 text-muted-foreground", isTv ? "text-lg" : "text-sm")}>
          Log in with the login ID and password from your TV provider to watch every channel in your plan.
        </p>

        {problem && (
          <div id="login-error" role="alert" className="mt-6 flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
            <problem.icon className={cn("mt-0.5 shrink-0 text-destructive", isTv ? "h-7 w-7" : "h-6 w-6")} aria-hidden />
            <div className="min-w-0">
              <p className={cn("font-bold text-foreground", isTv ? "text-xl" : "text-base")}>{problem.title}</p>
              <p className={cn("mt-0.5 text-muted-foreground", isTv ? "text-base" : "text-sm")}>{problem.message}</p>
              {problem.showPlans && (
                <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => navigate({ name: "premium" })}>
                  <Crown className="mr-1.5 h-4 w-4" /> View plans
                </Button>
              )}
            </div>
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-user" className={label}>
              Login ID
            </Label>
            <Input
              id="login-user"
              ref={userRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  passRef.current?.focus();
                }
              }}
              placeholder="Username or email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              data-autofocus
              aria-invalid={problem?.focus === "username" || undefined}
              aria-describedby={problem ? "login-error" : undefined}
              className={field}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-pass" className={label}>
              Password
            </Label>
            <Input
              id="login-pass"
              ref={passRef}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              enterKeyHint="go"
              aria-invalid={problem?.focus === "password" || undefined}
              aria-describedby={problem ? "login-error" : undefined}
              className={field}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-controls="login-pass"
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                isTv ? "h-12 text-lg" : "h-9 text-sm"
              )}
            >
              {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
              {showPassword ? "Hide password" : "Show password"}
            </button>
          </div>

          <Button
            ref={submitRef}
            type="submit"
            aria-busy={login.isPending}
            className={cn("w-full rounded-xl font-bold", isTv ? "h-16 text-xl" : "h-12 text-base")}
          >
            {login.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> Logging in…
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-5 w-5" aria-hidden /> Log in
              </>
            )}
          </Button>
          <p className={cn("text-muted-foreground", isTv ? "text-base" : "text-sm")}>
            Forgot your password? Your provider can reset it for you.
          </p>
        </form>
      </section>

      <LoginPlansPanel isTv={isTv} />
    </div>
  );
}

function LoginPlansPanel({ isTv }: { isTv: boolean }) {
  const plans = usePlans();
  const navigate = useAppStore((s) => s.navigate);

  return (
    <section aria-labelledby="login-plans-title" className="rounded-3xl border border-border/60 bg-card/30 p-6 sm:p-8">
      <h2 id="login-plans-title" className={cn("font-bold tracking-tight", isTv ? "text-3xl" : "text-2xl")}>
        Plans
      </h2>
      <p className={cn("mt-1 text-muted-foreground", isTv ? "text-lg" : "text-sm")}>
        One plan works on your TV, phone and computer.
      </p>
      <div className={cn("mt-5 grid gap-3", isTv ? "grid-cols-2" : "sm:grid-cols-2")}>
        {plans.isLoading ? (
          <PlansSkeleton count={2} compact />
        ) : plans.isError ? (
          <p className="col-span-full text-sm text-muted-foreground">Plans couldn&apos;t be loaded right now.</p>
        ) : (plans.data ?? []).length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">Your provider hasn&apos;t published plans yet.</p>
        ) : (
          (plans.data ?? []).slice(0, 4).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              compact
              action={{ label: "View plan", variant: "outline", onClick: () => navigate({ name: "premium" }) }}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* --------------------------------- Profile --------------------------------- */

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  INACTIVE: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  SUSPENDED: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  EXPIRED: "bg-red-500/15 text-red-400 border-red-500/30",
};

function ProfilePanel({ customer, hasAccess, reason }: { customer: CustomerInfo; hasAccess: boolean; reason: string }) {
  const queryClient = useQueryClient();
  const navigate = useAppStore((s) => s.navigate);
  const isTv = useIsTv();

  const logout = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/customer/logout", { method: "POST" });
    },
    onSuccess: async () => {
      toast.success("Logged out");
      await queryClient.invalidateQueries();
      navigate({ name: "home" });
    },
    onError: () => toast.error("Couldn't log out — check your connection."),
  });

  const expiresAt = customer.planExpiresAt ? new Date(customer.planExpiresAt) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="sr-only">Profile</h1>
      <section className="space-y-5 rounded-3xl border border-border/60 bg-card/60 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-2xl font-bold text-primary">
            {(customer.name || customer.username).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className={cn("font-bold", isTv ? "text-2xl" : "text-lg")}>{customer.name || customer.username}</p>
            <p className="truncate text-sm text-muted-foreground">
              @{customer.username}
              {customer.email ? ` • ${customer.email}` : ""}
            </p>
          </div>
          <Badge variant="outline" className={cn("ml-auto text-sm", STATUS_STYLES[customer.status])}>
            {customer.status}
          </Badge>
        </div>

        {!hasAccess && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <ShieldAlert className="h-6 w-6 shrink-0 text-amber-400" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              <b className="text-foreground">Your plan isn&apos;t active.</b>{" "}
              <span className="text-muted-foreground">{reason ? `${reason}.` : ""} Renew it to watch the full catalog.</span>
            </p>
            <Button className="rounded-full" data-autofocus onClick={() => navigate({ name: "premium" })}>
              <Crown className="mr-1.5 h-4 w-4" /> Renew
            </Button>
          </div>
        )}

        <dl className="grid gap-3 rounded-2xl border border-border/60 bg-background/40 p-4 sm:grid-cols-2">
          <InfoItem icon={Tv} label="Plan" value={customer.plan?.name ?? "No plan assigned"} />
          <InfoItem
            icon={CalendarClock}
            label="Expiry"
            value={
              expiresAt
                ? `${fmtDate(customer.planExpiresAt)}${daysLeft !== null ? (daysLeft >= 0 ? ` · ${daysLeft} days left` : " · expired") : ""}`
                : "No expiry"
            }
            danger={customer.expired}
          />
          <InfoItem icon={MonitorSmartphone} label="Devices" value={customer.plan ? `${customer.plan.maxDevices} at a time` : "—"} />
          <InfoItem
            icon={customer.plan?.allowAdult ? ShieldAlert : ShieldCheck}
            label="Adult content"
            value={customer.plan ? (customer.plan.allowAdult ? "Allowed" : "Blocked") : "—"}
          />
        </dl>

        <DeviceList />

        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full" data-autofocus={hasAccess || undefined} onClick={() => navigate({ name: "browse" })}>
            <Tv className="mr-1.5 h-4 w-4" /> Browse channels
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => navigate({ name: "premium" })}>
            <Crown className="mr-1.5 h-4 w-4" /> Subscription
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => navigate({ name: "settings" })}>
            <Settings className="mr-1.5 h-4 w-4" /> Settings
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={() => logout.mutate()} aria-busy={logout.isPending}>
            <LogOut className="mr-1.5 h-4 w-4" /> Log out
          </Button>
        </div>
      </section>
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={cn("truncate font-medium", danger ? "text-red-400" : "text-foreground")}>{value}</dd>
      </div>
    </div>
  );
}

interface DeviceRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  current: boolean;
}

function DeviceList() {
  const queryClient = useQueryClient();
  const devicesQuery = useQuery({
    queryKey: ["customer-sessions"],
    queryFn: async (): Promise<DeviceRow[]> => {
      const res = await fetch("/api/auth/customer/sessions");
      if (!res.ok) return [];
      return (await res.json()).items ?? [];
    },
  });

  const logoutAll = useMutation({
    mutationFn: () => fetch("/api/auth/customer/sessions", { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Logged out of all devices");
      queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const devices = devicesQuery.data ?? [];
  if (devices.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Active devices ({devices.length})</p>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-red-400 hover:text-red-300"
          onClick={() => logoutAll.mutate()}
          aria-busy={logoutAll.isPending}
        >
          Log out all
        </Button>
      </div>
      <ul className="space-y-1.5">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {(d.userAgent ?? "Unknown device").slice(0, 48)}
              {d.current && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">this device</span>}
            </span>
            <span className="shrink-0 tabular-nums">{fmtDate(d.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
