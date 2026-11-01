"use client";

import { Download, Heart, MonitorSmartphone, User, WalletCards } from "lucide-react";
import { useAppStore } from "@/lib/store";

export function Footer() {
  const setTvGuideOpen = useAppStore((s) => s.setTvGuideOpen);
  const setSupportOpen = useAppStore((s) => s.setSupportOpen);
  const navigate = useAppStore((s) => s.navigate);
  const upiVpa = process.env.NEXT_PUBLIC_UPI_VPA;

  return (
    <footer className="mt-auto w-full border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            { }
            <img src="/icons/icon-192.png" alt="StreamKaro logo" className="h-7 w-7 rounded-md" />
            <div>
              <p className="text-sm font-bold text-brand-gradient">StreamKaro</p>
              <p className="text-xs text-muted-foreground">Live TV channels from around the world, in one place.</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTvGuideOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MonitorSmartphone className="h-3.5 w-3.5" />
                How to watch on TV / Pendrive? — Open guide
              </button>
              {upiVpa && (
                <button
                  onClick={() => setSupportOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Heart className="h-3.5 w-3.5 fill-current" />
                  Support us (UPI)
                </button>
              )}
              <button
                onClick={() => navigate({ name: "download" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Download className="h-3.5 w-3.5" />
                Download app
              </button>
              <button
                onClick={() => navigate({ name: "account" })}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/40 bg-zinc-500/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <User className="h-3.5 w-3.5" />
                Log in / My plan
              </button>
              <a
                href="https://www.streamkaro.aetherdevsolutions.in/platform#/plans"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <WalletCards className="h-3.5 w-3.5" />
                View plans
              </a>
            </div>
            <p>
              StreamKaro does not host, upload or own any video content. Streams come from third-party playlists. Availability varies by region.
            </p>
            <p className="mt-1.5">&copy; {new Date().getFullYear()} StreamKaro. All trademarks belong to their respective owners.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
