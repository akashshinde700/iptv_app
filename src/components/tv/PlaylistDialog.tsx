"use client";

/**
 * "Watch in another app" — one link that works in VLC / TiviMate / Kodi / IPTV Smarters on
 * any phone, laptop or TV box.
 *
 * Why this exists: browsers can't always play every IPTV stream, and people wanted to keep
 * using the player they already love without hunting for a working "server". The generated
 * playlist always contains the currently-working source per channel (the server removes dead
 * ones), so the link keeps working by itself.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Loader2, MonitorSmartphone, QrCode, Share2, Smartphone, Tv } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchMyPlaylist } from "@/lib/api";
import { shareLink } from "@/lib/ios-shell";
import { useIsTv } from "@/lib/store";

export function PlaylistDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const isTv = useIsTv();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(!isTv);
  const [shared, setShared] = useState(false);

  const query = useQuery({
    queryKey: ["my-playlist"],
    queryFn: fetchMyPlaylist,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const url = query.data?.url ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard blocked (http / TV browser) — the URL is selectable instead */
    }
  };

  /**
   * Sends the link to another device the way phones expect: the native iOS
   * share sheet inside the app, the Web Share API in a browser, clipboard as a
   * last resort. This is how people move the playlist onto their TV setup.
   */
  const share = async () => {
    const result = await shareLink({ url, title: "My StreamKaro playlist" });
    if (result === "copied") setCopied(true);
    if (result !== "failed") setShared(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5 text-primary" /> Watch in another app
          </DialogTitle>
          <DialogDescription>
            Paste this link into VLC, TiviMate, Kodi or any IPTV player. Dead channels are removed automatically, so
            you never pick a &quot;server&quot; by hand.
          </DialogDescription>
        </DialogHeader>

        {query.isPending && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {query.isError && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            A plan is required to get a playlist. Open Subscription to activate one.
          </p>
        )}

        {query.data && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Your playlist link
              </p>
              <p className="break-all font-mono text-xs leading-relaxed text-foreground">{url}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" className="rounded-full" onClick={copy} data-autofocus>
                  {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setShowQr((v) => !v)}>
                  <QrCode className="mr-1 h-4 w-4" /> {showQr ? "Hide QR" : "Show QR"}
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => void share()}>
                  {shared ? <Check className="mr-1 h-4 w-4" /> : <Share2 className="mr-1 h-4 w-4" />}
                  {shared ? "Shared" : "Share link"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                This link is private — anyone with it can watch your plan. Don&apos;t share it.
              </p>
            </div>

            {showQr && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-white p-4">
                <QRCodeSVG value={url} size={isTv ? 200 : 164} level="M" />
                <p className="text-center text-[11px] text-zinc-700">Scan with your phone, then paste into your player</p>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Works with</p>
              <div className="flex flex-wrap gap-1.5">
                {(query.data.apps ?? []).map((app) => (
                  <span key={app} className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
                    {app}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-2 text-sm">
              <Step
                icon={Tv}
                title="On a smart TV / Android TV"
                body="Install TiviMate or IPTV Smarters, choose “Add playlist → M3U URL”, paste the link."
              />
              <Step
                icon={Smartphone}
                title="On your phone"
                body="Scan the QR, or copy the link and paste it into your IPTV app."
              />
              <Step
                icon={MonitorSmartphone}
                title="On a laptop"
                body="VLC → Media → Open Network Stream → paste the link."
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Step({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-card/40 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
