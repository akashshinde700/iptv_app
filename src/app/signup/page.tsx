"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X, Tv } from "lucide-react";

type Availability = "idle" | "checking" | "available" | "taken" | "reserved" | "invalid";

const APEX = process.env.NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN || "streamkaro.app";

export default function SignupPage() {
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [avail, setAvail] = useState<Availability>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ storefrontUrl: string; adminUrl: string; trialEndsAt: string | null } | null>(null);

  // debounced subdomain availability check
  useEffect(() => {
    const s = slug.trim().toLowerCase();
    // Nothing is set synchronously in the effect body: a setState there caused an extra render
    // pass on every keystroke (and a react-hooks warning). The debounce owns the state changes.
    const t = setTimeout(async () => {
      if (!s) {
        setAvail("idle");
        return;
      }
      setAvail("checking");
      try {
        const res = await fetch(`/api/signup/check?slug=${encodeURIComponent(s)}`);
        const data = await res.json();
        if (data.available) setAvail("available");
        else setAvail((data.reason as Availability) ?? "taken");
      } catch {
        setAvail("idle");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, slug, adminName, email, username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Signup fail ho gaya");
      setDone(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kuch galat ho gaya");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="w-full max-w-md rounded-2xl border border-emerald-800/60 bg-zinc-900/70 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            <Check className="h-7 w-7 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Storefront ready hai 🎉</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {done.trialEndsAt
              ? `14-din ka free trial ${new Date(done.trialEndsAt).toLocaleDateString()} tak.`
              : "Free trial shuru ho gaya."}
          </p>
          <div className="mt-6 space-y-2 text-left text-sm">
            <LinkRow label="Storefront" href={done.storefrontUrl} />
            <LinkRow label="Admin panel" href={done.adminUrl} />
          </div>
          <p className="mt-6 text-xs text-zinc-500">
            Admin panel me login karke apne portals (Xtream / Stalker / M3U) add karo aur plans banao.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15">
            <Tv className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Apna IPTV storefront banao</h1>
          <p className="text-center text-sm text-zinc-500">
            Free 14-din trial • koi card nahi • 2 minute me live
          </p>
        </div>

        <div className="space-y-4">
          <Field label="Business / brand ka naam">
            <input className={inputCls} value={orgName} onChange={(e) => setOrgName(e.target.value)}
              placeholder="Bolly TV" required />
          </Field>

          <Field label="Subdomain">
            <div className="flex items-stretch overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 focus-within:border-amber-500">
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="bollytv"
                required
              />
              <span className="flex items-center bg-zinc-800/80 px-3 text-xs text-zinc-400">.{APEX}</span>
            </div>
            <AvailabilityHint state={avail} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Aapka naam">
              <input className={inputCls} value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
            </Field>
            <Field label="Login username">
              <input className={inputCls} value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" required />
            </Field>
          </div>

          <Field label="Email">
            <input type="email" className={inputCls} value={email}
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>

          <Field label="Password (min 8 chars)">
            <input type="password" className={inputCls} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
          </Field>

          {error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || avail === "taken" || avail === "reserved" || avail === "invalid"}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Ban raha hai…" : "Storefront banao"}
          </button>
        </div>
      </form>
    </Shell>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] px-4 py-12">
      {children}
      <p className="mt-6 text-center text-xs text-zinc-600">
        Pehle se account hai? Apne <span className="text-zinc-400">subdomain</span>.{APEX}/admin pe login karo.
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <a href={href} className="truncate text-xs font-medium text-amber-400 hover:underline">{href}</a>
    </div>
  );
}

function AvailabilityHint({ state }: { state: Availability }) {
  if (state === "idle") return null;
  const map: Record<Availability, { text: string; cls: string; icon: React.ReactNode }> = {
    idle: { text: "", cls: "", icon: null },
    checking: { text: "Check kar rahe hain…", cls: "text-zinc-500", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    available: { text: "Available hai", cls: "text-emerald-400", icon: <Check className="h-3 w-3" /> },
    taken: { text: "Pehle se le liya gaya", cls: "text-red-400", icon: <X className="h-3 w-3" /> },
    reserved: { text: "Ye reserved hai", cls: "text-red-400", icon: <X className="h-3 w-3" /> },
    invalid: { text: "3–40 chars, a-z 0-9 -", cls: "text-amber-400", icon: <X className="h-3 w-3" /> },
  };
  const m = map[state];
  return <span className={`mt-1 flex items-center gap-1 text-xs ${m.cls}`}>{m.icon}{m.text}</span>;
}
