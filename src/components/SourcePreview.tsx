"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { Loader2, WifiOff, X } from "lucide-react";

/**
 * Tiny in-panel player for admins/staff to eyeball whether ONE source actually plays.
 * Takes a signed same-origin proxy URL (raw credentials never reach the browser). Autoplays
 * muted; shows clear loading / playing / dead states so "working?" is answered visually.
 */
export function SourcePreview({ url, label, onClose }: { url: string; label?: string; onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let hls: Hls | null = null;

    // The proxy URL is opaque (encrypted), so a non-sensitive k=hls hint marks HLS sources.
    const lower = url.toLowerCase();
    const isHls = lower.includes("m3u8") || lower.includes("k=hls");

    // Give a dead source ~20s before we call it: many live sources connect slowly.
    const deadline = window.setTimeout(() => {
      if (!cancelled && video.readyState < 2) setStatus("error");
    }, 20000);

    const onPlaying = () => {
      if (!cancelled) setStatus("playing");
    };
    video.addEventListener("playing", onPlaying);

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ manifestLoadingTimeOut: 15000, manifestLoadingMaxRetry: 2, fragLoadingTimeOut: 20000 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!cancelled) video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (cancelled || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }
        setStatus("error");
        hls?.destroy();
        hls = null;
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
      const onLoaded = () => {
        if (!cancelled) video.play().catch(() => {});
      };
      const onError = () => {
        if (!cancelled) setStatus("error");
      };
      video.addEventListener("loadeddata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
      video.removeEventListener("playing", onPlaying);
      if (hls) hls.destroy();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };
  }, [url]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-700 bg-black">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        <span className="truncate text-xs font-medium text-zinc-300">
          {status === "playing" ? "▶ Playing" : status === "error" ? "Not playing" : "Connecting…"}
          {label ? ` · ${label}` : ""}
        </span>
        {onClose && (
          <button onClick={onClose} aria-label="Close preview" className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="relative aspect-video w-full">
        <video ref={videoRef} playsInline muted controls className="h-full w-full bg-black" />
        {status !== "playing" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50">
            {status === "error" ? (
              <>
                <WifiOff className="h-8 w-8 text-red-400" />
                <p className="text-sm font-medium text-zinc-200">Ye source play nahi ho raha</p>
                <p className="text-xs text-zinc-400">Server down / dead source lagta hai — dusra try karo</p>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                <p className="text-sm text-zinc-300">Connecting to source…</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
