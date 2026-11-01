"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, Copy, Heart, IndianRupee, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

const AMOUNTS = [19, 49, 99];

/**
 * "Support StreamKaro" dialog — no-login monetization.
 *
 * Owner setup (one line): set NEXT_PUBLIC_UPI_VPA (your UPI ID, e.g.
 * `yourname@okhdfcbank`) and NEXT_PUBLIC_UPI_NAME in .env — the QR + UPI
 * deep-link then pay DIRECTLY into your account. No gateway, no login,
 * no platform fees (0% — straight UPI).
 */
export function SupportDialog() {
  const open = useAppStore((s) => s.supportOpen);
  const setOpen = useAppStore((s) => s.setSupportOpen);

  const vpa = process.env.NEXT_PUBLIC_UPI_VPA ?? "";
  const payeeName = process.env.NEXT_PUBLIC_UPI_NAME ?? "StreamKaro";

  const [amount, setAmount] = useState<number>(49);
  const [custom, setCustom] = useState("");
  const [copied, setCopied] = useState(false);

  const effectiveAmount = custom ? Math.max(1, Math.min(100000, parseInt(custom, 10) || 0)) : amount;

  const upiUri = useMemo(() => {
    if (!vpa) return "";
    const params = new URLSearchParams({
      pa: vpa,
      pn: payeeName,
      cu: "INR",
      tn: "StreamKaro support",
    });
    if (effectiveAmount > 0) params.set("am", String(effectiveAmount));
    return `upi://pay?${params.toString()}`;
  }, [vpa, payeeName, effectiveAmount]);

  const copyVpa = async () => {
    try {
      await navigator.clipboard.writeText(vpa);
      setCopied(true);
      toast.success("UPI ID copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy it manually");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto thin-scrollbar sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Heart className="h-5 w-5 fill-primary text-primary" />
            Support StreamKaro
          </DialogTitle>
          <DialogDescription>
            Servers and bandwidth cost money 💪 — a small contribution goes a long way.{" "}
            <b className="text-foreground">100% direct via your UPI</b>, no login.
          </DialogDescription>
        </DialogHeader>

        {vpa ? (
          <div className="space-y-4">
            {/* amount chips */}
            <div className="flex items-center gap-2" role="group" aria-label="Support amount">
              {AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setAmount(a);
                    setCustom("");
                  }}
                  aria-pressed={!custom && amount === a}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-0.5 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !custom && amount === a
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <IndianRupee className="h-3.5 w-3.5" />
                  {a}
                </button>
              ))}
              <div className="relative flex-1">
                <IndianRupee className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="number"
                  min={1}
                  placeholder="Custom"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  aria-label="Custom amount"
                  className="h-[42px] rounded-xl border-border/60 bg-card/60 pl-7"
                />
              </div>
            </div>

            {/* QR */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card/60 p-5">
              {upiUri && (
                <div className="rounded-xl bg-white p-3 shadow-inner">
                  <QRCodeSVG value={upiUri} size={180} level="M" aria-label={`UPI QR code for ${payeeName}`} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Scan with any UPI app — GPay, PhonePe, Paytm, BHIM
              </p>
              <div className="flex w-full items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-muted/60 px-3 py-2 text-center text-sm font-semibold">
                  {vpa}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={copyVpa}
                  aria-label="Copy UPI ID"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              {/* mobile: one-tap open in UPI app */}
              <a
                href={upiUri}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                <Smartphone className="h-4 w-4" />
                Open in UPI app{effectiveAmount > 0 ? ` — ₹${effectiveAmount}` : ""}
              </a>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Payment happens <b>directly</b> in your UPI app — we don&apos;t store any card or bank details.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 p-5 text-center text-sm text-muted-foreground">
            Support button coming soon! 🙂
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
