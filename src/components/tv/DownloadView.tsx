"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Apple, Check, Download, Monitor, MonitorDown, Smartphone, Tv, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInstallPrompt } from "@/components/tv/AppShell";
import { APP_VERSION, DOWNLOADS, type DownloadTarget } from "@/lib/downloads";
import type { DownloadAvailability } from "@/app/api/app/downloads/route";
import { useAppStore } from "@/lib/store";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  win: Monitor,
  android: Smartphone,
  androidtv: Tv,
  ios: Apple,
  mac: Apple,
  linux: MonitorSmartphone,
};

export function DownloadView() {
  const navigate = useAppStore((s) => s.navigate);
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [ua, setUa] = useState("");

  useEffect(() => {
    setUa(navigator.userAgent);
    const check = () => setCanInstallPwa(!!getInstallPrompt());
    check();
    window.addEventListener("streamkaro:installable", check);
    return () => window.removeEventListener("streamkaro:installable", check);
  }, []);

  // Ask the server which artifacts actually exist. A download button that 404s is worse than
  // an honest "not uploaded yet", and this also picks up size for the label.
  const availability = useQuery({
    queryKey: ["app-downloads"],
    queryFn: async (): Promise<DownloadAvailability[]> => {
      const res = await fetch("/api/app/downloads");
      if (!res.ok) return [];
      const data = (await res.json()) as { targets?: DownloadAvailability[] };
      return data.targets ?? [];
    },
    staleTime: 60_000,
  });
  const statusById = new Map((availability.data ?? []).map((t) => [t.id, t]));

  const isAndroid = /android/i.test(ua);
  const isWindows = /windows/i.test(ua);
  const primaryId = isAndroid ? "android" : isWindows ? "win" : null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
          <Download className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Get the StreamKaro app</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          One account — phone, TV, laptop, desktop. The same channels and plan everywhere.
          <span className="mt-1 block text-xs text-muted-foreground/70">Version {APP_VERSION}</span>
        </p>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {DOWNLOADS.map((d) => (
          <DownloadCard
            key={d.id}
            target={d}
            availability={statusById.get(d.id)}
            highlight={d.id === primaryId}
          />
        ))}
      </div>

      {/* PWA install */}
      <div className="mt-4 rounded-2xl border border-border/60 bg-card/50 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <MonitorDown className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold">Install as an app (no download)</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Right from your browser — add StreamKaro to your home screen / taskbar. The lightest
              option, auto-updates, and works on both phone and desktop.
            </p>
            <div className="mt-3">
              {canInstallPwa ? (
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    const p = getInstallPrompt();
                    if (p) p.prompt();
                  }}
                >
                  <MonitorDown className="mr-1.5 h-4 w-4" /> Install now
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground/80">
                  {isAndroid
                    ? "Chrome menu (⋮) → “Add to Home screen”."
                    : /iphone|ipad/i.test(ua)
                      ? "Safari → Share → “Add to Home Screen”."
                      : "Browser address bar me install icon (⊕) dikhega, ya menu → “Install StreamKaro”."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TV help */}
      <button
        onClick={() => useAppStore.getState().setTvGuideOpen(true)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card/50 p-5 text-left transition hover:border-primary/40"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Tv className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold">How to watch on a Smart TV?</h3>
            <p className="text-sm text-muted-foreground">Android TV / Fire TV / Samsung / LG — full guide</p>
          </div>
        </div>
        <span className="text-primary">→</span>
      </button>

      <p className="mt-6 text-center text-xs text-muted-foreground/70">
        The Windows installer isn&apos;t code-signed yet — you may see “Windows protected your PC” during install;
        <br className="hidden sm:block" /> click “More info → Run anyway”. For the Android APK, allow “Install unknown apps”.
      </p>

      <div className="mt-6 text-center">
        <Button variant="ghost" onClick={() => navigate({ name: "home" })}>
          ← Home
        </Button>
      </div>
    </div>
  );
}

function formatSize(bytes: number | null | undefined): string | undefined {
  if (!bytes) return undefined;
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `~${Math.round(mb)} MB` : `~${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function DownloadCard({
  target,
  availability,
  highlight,
}: {
  target: DownloadTarget;
  availability?: DownloadAvailability;
  highlight?: boolean;
}) {
  const Icon = ICONS[target.id] ?? Download;
  // Still checking → show the button (most links do exist); once we know, respect the answer.
  const checked = !!availability;
  const available = availability ? availability.available : !!target.href;
  const size = formatSize(availability?.sizeBytes) ?? target.size;

  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        highlight ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold">{target.platform}</h3>
            {highlight && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                For your device
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{target.label}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{target.hint}</p>
      <div className="mt-4">
        {available && target.href ? (
          <a href={target.href} download>
            <Button size="sm" className="w-full rounded-full">
              <Download className="mr-1.5 h-4 w-4" />
              Download{size ? ` · ${size}` : ""}
            </Button>
          </a>
        ) : target.href && checked ? (
          // The link exists in config but the build is not on the server yet — say so plainly
          // instead of handing the visitor a 404.
          <>
            <Button size="sm" variant="outline" disabled className="w-full rounded-full opacity-60">
              <Check className="mr-1.5 h-4 w-4" /> Build not uploaded yet
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              Use “Install as an app” below — same channels, no download.
            </p>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled className="w-full rounded-full opacity-60">
            <Check className="mr-1.5 h-4 w-4" /> Coming soon
          </Button>
        )}
      </div>
    </div>
  );
}
