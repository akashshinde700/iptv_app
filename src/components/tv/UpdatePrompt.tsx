"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { AppUpdater, getNativeAppInfo, hasNativePlugin } from "@/lib/native";
import { apkUrlFor, shouldOfferUpdate, type AppVersionResponse } from "@/lib/native-utils";

const DISMISS_KEY = "sk-update-dismissed";

/** Dispatch on window to run a manual update check (Settings → Check for updates). */
export const CHECK_UPDATE_EVENT = "streamkaro:check-update";

type Phase = "offer" | "downloading" | "permission" | "installing" | "error";

interface Offer {
  version: string;
  versionCode: number;
  notes: string[];
  url: string;
}

function readDismissed(): number | null {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Android shell only: checks /api/app/version against the installed APK and offers an
 * in-app download + install (AppUpdater plugin). Renders nothing in browsers.
 */
export function UpdatePrompt() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("offer");
  const [percent, setPercent] = useState(-1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasNativePlugin("AppUpdater")) return;
    let cancelled = false;
    const check = async (manual: boolean) => {
      const info = await getNativeAppInfo();
      if (!info) return;
      const res = await fetch("/api/app/version", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { android } = (await res.json()) as AppVersionResponse;
      if (cancelled) return;
      // a manual check ignores an earlier "Later"
      if (!shouldOfferUpdate(info.versionCode, android.versionCode, manual ? null : readDismissed())) {
        if (manual) toast.success(`You're on the latest version (${info.versionName}).`);
        return;
      }
      setPhase("offer");
      setOffer({
        version: android.version,
        versionCode: android.versionCode,
        notes: android.notes,
        url: new URL(apkUrlFor(android, info.flavor), window.location.origin).href,
      });
      setOpen(true);
    };
    const onManualCheck = () => {
      check(true).catch(() => toast.error("Couldn't check for updates. Try again later."));
    };
    check(false).catch(() => {});
    window.addEventListener(CHECK_UPDATE_EVENT, onManualCheck);
    return () => {
      cancelled = true;
      window.removeEventListener(CHECK_UPDATE_EVENT, onManualCheck);
    };
  }, []);

  const later = () => {
    if (offer) {
      try {
        localStorage.setItem(DISMISS_KEY, String(offer.versionCode));
      } catch {
        /* storage blocked */
      }
    }
    setOpen(false);
  };

  const startUpdate = useCallback(async () => {
    if (!offer) return;
    setError("");
    setPercent(-1);
    setPhase("downloading");
    const handle = await AppUpdater.addListener("downloadProgress", (p) => setPercent(p.percent));
    try {
      await AppUpdater.downloadAndInstall({ url: offer.url });
      setPhase("installing");
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "INSTALL_PERMISSION_REQUIRED") {
        setPhase("permission");
      } else {
        setError(err.message || "Update failed.");
        setPhase("error");
      }
    } finally {
      void handle.remove();
    }
  }, [offer]);

  if (!offer) return null;
  const downloading = phase === "downloading";

  return (
    <Dialog open={open} onOpenChange={(next) => !downloading && setOpen(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update available · v{offer.version}</DialogTitle>
          <DialogDescription>A new version of StreamKaro is ready to install.</DialogDescription>
        </DialogHeader>

        {phase === "offer" && offer.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {offer.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}

        {downloading && (
          <div className="space-y-2">
            <Progress value={Math.max(0, percent)} aria-label="Download progress" />
            <p className="text-xs text-muted-foreground">
              {percent >= 0 ? `Downloading… ${percent}%` : "Downloading…"}
            </p>
          </div>
        )}

        {phase === "permission" && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            Android needs your permission to install updates. Tap “Allow”, turn on “Allow from this
            source”, then come back and tap “Try again”.
          </p>
        )}

        {phase === "installing" && (
          <p className="text-sm text-muted-foreground">
            Confirm the Android installer prompt to finish. StreamKaro reopens on the new version.
          </p>
        )}

        {phase === "error" && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          {phase === "offer" && (
            <>
              <Button variant="ghost" onClick={later}>
                Later
              </Button>
              <Button onClick={startUpdate} autoFocus>
                <Download className="mr-1.5 h-4 w-4" /> Update now
              </Button>
            </>
          )}
          {downloading && (
            <Button disabled>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Downloading
            </Button>
          )}
          {phase === "permission" && (
            <>
              <Button variant="outline" onClick={() => AppUpdater.openInstallSettings().catch(() => {})} autoFocus>
                Allow
              </Button>
              <Button onClick={startUpdate}>Try again</Button>
            </>
          )}
          {(phase === "installing" || phase === "error") && (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={startUpdate} autoFocus={phase === "error"}>
                {phase === "error" ? "Try again" : "Install again"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
