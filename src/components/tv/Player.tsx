"use client";

import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Heart,
  FastForward,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Rewind,
  Scan,
  SkipBack,
  SkipForward,
  Subtitles,
  Tv,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toPlayableUrl } from "@/lib/api";
import {
  getNativeAppInfo,
  hasNativePlugin,
  playNative,
  readPlayerEnginePreference,
  savePlayerEnginePreference,
  type NativePlayResult,
} from "@/lib/native";
import {
  readMutedPreference,
  readVolumePreference,
  saveMutedPreference,
  saveVolumePreference,
} from "@/lib/player-prefs";
import { useIsTv } from "@/lib/store";
import type { StreamInfo } from "@/lib/types";

type PlayerStatus = "loading" | "playing" | "paused" | "buffering" | "error";

/** "pending" = inside the Android shell, still asking whether this is a TV. */
type PlayerEngine = "pending" | "native" | "web";

/** Web player zoom modes (same idea as the native player's Fit / Zoom / Stretch). */
const FIT_MODES = [
  { label: "Fit", className: "object-contain" },
  { label: "Zoom", className: "object-cover" },
  { label: "Stretch", className: "object-fill" },
] as const;

const CONTROLS_HIDE_MS = 3500;
/** No playback progress for this long ⇒ treat the source as dead and fail over. */
const STALL_WATCHDOG_MS = 22_000;
const MAX_RECONNECTS = 3;
const OFFLINE_MESSAGE = "You're offline — the channel will start again when the connection is back.";

function initialEngine(): PlayerEngine {
  if (!hasNativePlugin("NativePlayer")) return "web";
  return readPlayerEnginePreference() ?? "pending";
}

interface HlsLevel {
  height: number;
  bitrate: number;
}

/** A subtitle track offered by the media source (already pointed at /api/proxy). */
export interface PlayerSubtitle {
  id: string;
  label: string;
  lang: string;
  url: string;
}

export interface PlayerProps {
  stream: StreamInfo | null;
  /** channel name */
  title?: string;
  onNextSource?: () => void;
  hasNextSource?: boolean;
  onPreviousChannel?: () => void;
  onNextChannel?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** leaving the full-screen native player (Back) — the watch page returns to its list */
  onClosed?: () => void;
  /** Show seek controls for on-demand video, not live streams. */
  seekable?: boolean;
  /** health-aware failover: the current source failed / succeeded (WatchView reports + advances) */
  onSourceError?: (streamId: string, error?: string) => void;
  onSourceOk?: (streamId: string) => void;
  /** Subtitle tracks for this source (VOD). Empty/undefined hides the subtitle picker. */
  subtitles?: PlayerSubtitle[];
  /** Resume playback at this position (seconds) on first load — VOD "Continue watching". */
  startAt?: number;
  /** Playback heartbeat (throttled to ~5s) so the app can persist a resume position. */
  onProgress?: (seconds: number, duration: number) => void;
}

/**
 * Video player (public wrapper).
 * Remounts the core when the source changes or retry is pressed, so the core
 * always boots with fresh state ("loading", empty levels) — no setState-in-effect.
 * Always plays through the same-origin /api/proxy (Referer/UA/CORS handled server-side).
 * D-pad friendly: every control is a focusable <button>; OK on the player = play/pause.
 *
 * Inside the Android shell the full-screen Media3 player is used instead — by default
 * on TVs, or whenever the user picks it — because it decodes far more IPTV formats.
 */
export function Player(props: PlayerProps) {
  const { stream } = props;
  const [retryNonce, setRetryNonce] = useState(0);
  const [engine, setEngine] = useState<PlayerEngine>(initialEngine);

  useEffect(() => {
    if (engine !== "pending") return;
    let cancelled = false;
    getNativeAppInfo().then((info) => {
      if (!cancelled) setEngine(info?.isTv ? "native" : "web");
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  const switchEngine = (next: "native" | "web") => {
    savePlayerEnginePreference(next);
    setEngine(next);
  };

  const key = `${stream?.id ?? "none"}-${retryNonce}`;
  const onRetry = () => setRetryNonce((n) => n + 1);

  if (engine === "pending") {
    return (
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-black">
        <Loader2 className="h-12 w-12 animate-spin text-primary" aria-label="Loading player" />
      </div>
    );
  }

  if (engine === "native") {
    return <NativePlayerCore key={key} {...props} onRetry={onRetry} onUseWeb={() => switchEngine("web")} />;
  }

  return (
    <PlayerCore
      key={key}
      {...props}
      onRetry={onRetry}
      onUseNative={hasNativePlugin("NativePlayer") ? () => switchEngine("native") : undefined}
    />
  );
}

/**
 * Hands the stream to the native full-screen player once per mount. Coming back:
 * Back → onClosed (the watch page returns to its list), previous/next → switch channel,
 * errors → retry / next source actions here.
 */
function NativePlayerCore({
  stream,
  title,
  onNextSource,
  hasNextSource,
  onPreviousChannel,
  onNextChannel,
  onClosed,
  onSourceError,
  onSourceOk,
  onRetry,
  onUseWeb,
}: PlayerProps & { onRetry: () => void; onUseWeb: () => void }) {
  const [result, setResult] = useState<NativePlayResult | null>(null);
  const launchArgs = useRef({ stream, title, hasPrevious: !!onPreviousChannel, hasNext: !!onNextChannel });
  const handlers = useRef({ onPreviousChannel, onNextChannel, onClosed, onSourceError, onSourceOk });
  const launched = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    handlers.current = { onPreviousChannel, onNextChannel, onClosed, onSourceError, onSourceOk };
  });

  useEffect(() => {
    mounted.current = true;
    // Guard against StrictMode's double effect run opening two players.
    const { stream: s, title: t, hasPrevious, hasNext } = launchArgs.current;
    if (s && !launched.current) {
      launched.current = true;
      playNative(s, { title: t, hasPrevious, hasNext })
        .then((r) => {
          const h = handlers.current;
          // Health report is independent of whether we're still mounted — the source
          // either played (any clean exit) or failed. This drives auto-failover.
          if (s.id) {
            if (r.reason === "error") h.onSourceError?.(s.id, r.message);
            else h.onSourceOk?.(s.id);
          }
          if (!mounted.current) return;
          if (r.reason === "next" && h.onNextChannel) h.onNextChannel();
          else if (r.reason === "previous" && h.onPreviousChannel) h.onPreviousChannel();
          else if ((r.reason === "closed" || r.reason === "ended") && h.onClosed) h.onClosed();
          else setResult(r);
        })
        .catch(() => {
          handlers.current.onSourceError?.(launchArgs.current.stream?.id ?? "", "player-launch-failed");
          if (mounted.current) {
            setResult({ reason: "error", message: "The full-screen player could not start.", errorKind: "other" });
          }
        });
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  const isError = result?.reason === "error";
  const showNext = !!(hasNextSource && onNextSource);

  return (
    <div
      data-player
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl bg-black px-6 text-center"
    >
      {!result && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-zinc-300">Opening full-screen player…</p>
        </>
      )}

      {result && (
        <>
          {isError ? (
            <WifiOff className="h-10 w-10 text-destructive" aria-hidden />
          ) : (
            <Tv className="h-10 w-10 text-primary" aria-hidden />
          )}
          <p className="max-w-md text-base font-medium text-zinc-200">
            {isError ? result.message ?? "Playback failed." : title ?? stream?.title ?? "Stream"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button className="rounded-full" onClick={onRetry} autoFocus={!(isError && showNext)} data-autofocus={!(isError && showNext) || undefined}>
              {isError ? <RefreshCw className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4 fill-current" />}
              {isError ? "Retry" : "Watch again"}
            </Button>
            {showNext && (
              <Button
                variant={isError ? "default" : "outline"}
                className="rounded-full border-border/70"
                onClick={onNextSource}
                autoFocus={isError}
                data-autofocus={isError || undefined}
              >
                <SkipForward className="mr-1.5 h-4 w-4" /> {isError ? "Try next source" : "Next source"}
              </Button>
            )}
            {isError && onNextChannel && (
              <Button variant="outline" className="rounded-full border-border/70" onClick={onNextChannel}>
                <SkipForward className="mr-1.5 h-4 w-4" /> Next channel
              </Button>
            )}
            <Button variant="ghost" className="rounded-full text-zinc-300" onClick={onUseWeb}>
              Use web player
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function PlayerCore({
  stream,
  title,
  onNextSource,
  hasNextSource,
  onPreviousChannel,
  onNextChannel,
  isFavorite,
  onToggleFavorite,
  onSourceError,
  onSourceOk,
  onRetry,
  onUseNative,
  seekable,
  subtitles,
  startAt,
  onProgress,
}: PlayerProps & { onRetry: () => void; onUseNative?: () => void }) {
  const isTv = useIsTv();
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  // audio is ON unless the viewer muted it themselves
  const [muted, setMuted] = useState(readMutedPreference);
  const [autoMuted, setAutoMuted] = useState(false);
  const [volume, setVolume] = useState(readVolumePreference);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [levels, setLevels] = useState<HlsLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fitIndex, setFitIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnectAttempts = useRef(0);
  const [activeSubtitle, setActiveSubtitle] = useState("off");
  const resumedRef = useRef(false);
  const progressRef = useRef(0);
  // Watchdog: a source can "load" and then silently freeze (black screen, stalled segment,
  // dead panel). Nothing throws, so the HLS error path never fires — the viewer used to sit
  // there and switch servers by hand. This closes that gap.
  const lastProgressRef = useRef(Date.now());
  const watchdogFiredRef = useRef(false);
  const watchdogHandlers = useRef({ onSourceError, stream });
  const mutedRef = useRef(muted);
  // Report each source's health at most once per mount (the core remounts per source),
  // so a healthy stream isn't spammed by repeated onPlaying and a dead one reports once.
  const reportedRef = useRef(false);

  const streamId = stream?.id;
  const reportOk = useCallback(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    if (streamId) onSourceOk?.(streamId);
  }, [streamId, onSourceOk]);

  const reportError = useCallback(
    (message: string) => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      if (streamId) onSourceError?.(streamId, message);
    },
    [streamId, onSourceError]
  );

  // The proxy URL is now opaque (encrypted), so ".m3u8" isn't visible — a k=hls hint says HLS.
  const isHlsStream = useMemo(() => {
    const u = stream?.url.toLowerCase() ?? "";
    return u.includes("m3u8") || u.includes("k=hls");
  }, [stream?.url]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const setMutedByUser = useCallback((next: boolean) => {
    setMuted(next);
    setAutoMuted(false);
    saveMutedPreference(next);
  }, []);

  const startPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = mutedRef.current;
    video.play().catch((err: unknown) => {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "AbortError") return;
      if (name === "NotAllowedError" && !video.muted) {
        // browser autoplay policy: sound needs a user gesture — start muted, offer unmute
        video.muted = true;
        setMuted(true);
        setAutoMuted(true);
        video.play().catch(() => setStatus("paused"));
        return;
      }
      setStatus("paused");
    });
  }, []);

  // show controls on activity; hide after a few seconds of playback unless focus is on them
  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!controlsRef.current?.contains(document.activeElement)) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    hideTimer.current = window.setTimeout(() => {
      if (!controlsRef.current?.contains(document.activeElement)) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
    return () => window.clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => {
    watchdogHandlers.current = { onSourceError, stream };
  }, [onSourceError, stream]);

  // Auto-failover watchdog (see STALL_WATCHDOG_MS). A paused video is a viewer choice, not a
  // failure — the timer is simply re-armed while paused.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (watchdogFiredRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        lastProgressRef.current = Date.now();
        return;
      }
      if (Date.now() - lastProgressRef.current < STALL_WATCHDOG_MS) return;
      watchdogFiredRef.current = true;
      const { onSourceError: failover, stream: current } = watchdogHandlers.current;
      if (!navigator.onLine) {
        setStatus("error");
        setErrorMessage(OFFLINE_MESSAGE);
        return;
      }
      setStatus("error");
      setErrorMessage("This server stopped responding — switching to another one.");
      if (current?.id) failover?.(current.id, "stalled");
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  // back online after a failure: try the channel again automatically
  useEffect(() => {
    if (status !== "error") return;
    const onOnline = () => onRetry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status, onRetry]);

  // initialise playback for this source (component remounts on source change/retry)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    const proxyUrl = toPlayableUrl(stream.url);
    let cancelled = false;

    if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        manifestLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 15000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 4,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        if (cancelled) return;
        setLevels(
          data.levels.map((l) => ({ height: l.height ?? 0, bitrate: l.bitrate ?? 0 })).filter((l) => l.height > 0)
        );
        setStatus("playing");
        startPlayback();
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (cancelled || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        // live stream hiccup: a few spaced-out reconnects before giving up (never an endless loop)
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && reconnectAttempts.current < MAX_RECONNECTS) {
          reconnectAttempts.current += 1;
          setReconnectAttempt(reconnectAttempts.current);
          setStatus("buffering");
          window.setTimeout(() => {
            if (!cancelled) hls.startLoad();
          }, 1500 * reconnectAttempts.current);
          return;
        }
        hls.destroy();
        hlsRef.current = null;
        setReconnectAttempt(0);
        setStatus("error");
        setErrorMessage(
          !navigator.onLine
            ? OFFLINE_MESSAGE
            : data.type === Hls.ErrorTypes.NETWORK_ERROR
              ? "This channel is currently unavailable."
              : "This channel can't be played on this device."
        );
        // A real upstream failure (not just being offline) counts against this source.
        if (navigator.onLine) reportError(`hls:${data.details ?? data.type}`);
      });

      hls.loadSource(proxyUrl);
      hls.attachMedia(video);
    } else {
      // native playback (Safari HLS, mp4, etc.)
      video.src = proxyUrl;
      const onCanPlay = () => {
        if (!cancelled) {
          setStatus("playing");
          startPlayback();
        }
      };
      const onError = () => {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(!navigator.onLine ? OFFLINE_MESSAGE : "This channel is currently unavailable.");
          if (navigator.onLine) reportError("video:error");
        }
      };
      video.addEventListener("loadedmetadata", onCanPlay, { once: true });
      video.addEventListener("error", onError, { once: true });
      return () => {
        cancelled = true;
        video.removeEventListener("loadedmetadata", onCanPlay);
        video.removeEventListener("error", onError);
        video.removeAttribute("src");
        video.load();
      };
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [stream?.id, isHlsStream, startPlayback, reportError]);

  // sync video element state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume]);

  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      // when leaving fullscreen, let the screen rotate freely again
      if (!fs) {
        try {
          (screen.orientation as unknown as { unlock?: () => void })?.unlock?.();
        } catch {
          /* not supported */
        }
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange as EventListener);
    };
  }, []);

  // Mobile: rotating the phone to landscape while a stream is loaded goes
  // fullscreen; rotating back to portrait exits. (Android WebView + Chrome.)
  useEffect(() => {
    if (!stream || isTv) return;
    const coarse =
      window.matchMedia?.("(pointer: coarse)").matches ||
      /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!coarse) return;

    const landscapeMql = window.matchMedia("(orientation: landscape)");

    const enterFs = () => {
      const el = containerRef.current;
      if (!el || document.fullscreenElement) return;
      const req =
        el.requestFullscreen?.bind(el) ??
        (el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
      Promise.resolve(req?.()).catch(() => {
        // iOS Safari: only the <video> element can go fullscreen
        (videoRef.current as unknown as { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
      });
    };

    const onOrient = () => {
      const landscape = landscapeMql.matches;
      if (landscape) enterFs();
      else if (document.fullscreenElement === containerRef.current) {
        document.exitFullscreen?.().catch(() => {});
      }
    };

    landscapeMql.addEventListener?.("change", onOrient);
    window.addEventListener("orientationchange", onOrient);
    // fire once in case we mount already in landscape
    if (landscapeMql.matches) enterFs();
    return () => {
      landscapeMql.removeEventListener?.("change", onOrient);
      window.removeEventListener("orientationchange", onOrient);
    };
  }, [stream?.id, isTv]);

  // VTT/SRT tracks are <track> children: the browser ignores the `default` attribute after
  // mount, so we flip `mode` imperatively whenever the viewer picks a track.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      track.mode = subtitles?.[i] && subtitles[i].id === activeSubtitle ? "showing" : "disabled";
    }
  }, [activeSubtitle, subtitles]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setStatus("playing");
    } else {
      video.pause();
      setStatus("paused");
    }
  }, []);

  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, time));
    setCurrentTime(video.currentTime);
  };

  const formatTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
  };

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    const req =
      el?.requestFullscreen?.bind(el) ??
      (el as unknown as { webkitRequestFullscreen?: () => Promise<void> })?.webkitRequestFullscreen;
    Promise.resolve(req?.())
      .then(() => {
        // phone/tablet: rotate the fullscreen video to landscape
        const coarse =
          window.matchMedia?.("(pointer: coarse)").matches ||
          /android|iphone|ipad|ipod/i.test(navigator.userAgent);
        if (coarse) {
          (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })
            ?.lock?.("landscape")
            .catch(() => {});
        }
      })
      .catch(() => {
        (videoRef.current as unknown as { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
      });
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      // PiP unsupported
    }
  }, []);

  const changeVolume = (next: number) => {
    const v = Math.max(0, Math.min(1, +next.toFixed(2)));
    setVolume(v);
    saveVolumePreference(v);
    if (v > 0 && muted) setMutedByUser(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    pokeControls();
    const onContainer = e.target === containerRef.current;
    switch (e.key) {
      case "Enter":
        // remote OK on the player itself = play / pause (buttons keep their own Enter)
        if (onContainer) {
          e.preventDefault();
          togglePlay();
        }
        break;
      case " ":
      case "k":
      case "MediaPlayPause":
        if (e.key === " " && !onContainer) break;
        e.preventDefault();
        togglePlay();
        break;
      case "m":
        setMutedByUser(!muted);
        break;
      case "f":
        toggleFullscreen();
        break;
      case "z":
        setFitIndex((i) => (i + 1) % FIT_MODES.length);
        break;
      case "ArrowUp":
      case "ArrowDown": {
        if (!onContainer) break;
        if (isTv) {
          // TV: zap channels like a set-top box (volume lives on the remote)
          const zap = e.key === "ArrowUp" ? onPreviousChannel : onNextChannel;
          if (zap) {
            e.preventDefault();
            zap();
          }
          break;
        }
        // keyboards: volume
        e.preventDefault();
        changeVolume(volume + (e.key === "ArrowUp" ? 0.1 : -0.1));
        break;
      }
    }
  };

  const levelOptions = useMemo(() => {
    const uniq = new Map<string, number>();
    levels.forEach((l, idx) => uniq.set(`${l.height}p`, idx));
    return [...uniq.entries()];
  }, [levels]);

  const showControls = controlsVisible || status !== "playing";
  const controlButton = cn("rounded-full text-white hover:bg-white/15 hover:text-white", isTv ? "h-11 w-11" : "h-9 w-9");
  const label = title ?? stream?.title ?? "Stream";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={pokeControls}
      onTouchStart={pokeControls}
      onFocusCapture={pokeControls}
      aria-label={`Video player: ${label}. Press OK to play or pause.`}
      data-player
      data-autofocus
      className={cn(
        "group/player relative aspect-video w-full overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !showControls && "cursor-none"
      )}
    >
      <video
        ref={videoRef}
        playsInline
        muted={muted}
        className={cn("h-full w-full", FIT_MODES[fitIndex].className)}
        onWaiting={() => setStatus((s) => (s === "playing" ? "buffering" : s))}
        onPlaying={() => {
          reconnectAttempts.current = 0;
          setReconnectAttempt(0);
          lastProgressRef.current = Date.now();
          setStatus("playing");
          reportOk();
        }}
        onPause={() => setStatus((s) => (s === "error" ? s : "paused"))}
        onLoadedMetadata={() => {
          const video = videoRef.current;
          lastProgressRef.current = Date.now();
          setDuration(video?.duration ?? 0);
          // Resume exactly once per source, and only when the viewer actually has a
          // position to resume from (never fight a manual seek).
          if (video && !resumedRef.current && startAt && startAt > 5) {
            resumedRef.current = true;
            const target = Number.isFinite(video.duration) && video.duration > 0
              ? Math.min(startAt, Math.max(0, video.duration - 10))
              : startAt;
            try {
              video.currentTime = target;
              setCurrentTime(target);
            } catch {
              /* seeking unsupported (some live streams) */
            }
          }
        }}
        onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
        onTimeUpdate={() => {
          const video = videoRef.current;
          if (!video) return;
          lastProgressRef.current = Date.now();
          setCurrentTime(video.currentTime);
          // throttled heartbeat: persist a resume point every ~5s of playback
          if (onProgress && video.currentTime - progressRef.current >= 5) {
            progressRef.current = video.currentTime;
            onProgress(video.currentTime, Number.isFinite(video.duration) ? video.duration : 0);
          }
        }}
        onEnded={() => onProgress?.(0, 0)}
        onClick={togglePlay}
      >
        {(subtitles ?? []).map((track) => (
          <track
            key={track.id}
            kind="subtitles"
            src={track.url}
            srcLang={track.lang}
            label={track.label}
            default={activeSubtitle === track.id}
          />
        ))}
      </video>

      {/* Loading / buffering spinner */}
      {(status === "loading" || status === "buffering") && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
          <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
          <p role="status" className="rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
            {reconnectAttempt > 0
              ? `Reconnecting… ${reconnectAttempt}/${MAX_RECONNECTS}`
              : status === "loading"
                ? "Connecting to channel…"
                : "Buffering…"}
          </p>
        </div>
      )}

      {/* Paused: big center play button */}
      {status === "paused" && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          tabIndex={-1}
          className="absolute inset-0 flex items-center justify-center bg-black/50 outline-none"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105">
            <Play className="ml-1 h-8 w-8 fill-current" />
          </span>
        </button>
      )}

      {/* Browser autoplay policy started us muted: one clear way to get sound */}
      {autoMuted && muted && status !== "error" && (
        <button
          onClick={() => setMutedByUser(false)}
          className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <VolumeX className="h-4 w-4" aria-hidden /> Tap to unmute
        </button>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center" role="alert">
          <WifiOff className="h-10 w-10 text-destructive" aria-hidden />
          <p className="max-w-md text-base font-medium text-zinc-200">{errorMessage}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" className="rounded-full border-border/70" onClick={onRetry} autoFocus={!(hasNextSource && onNextSource)}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Retry
            </Button>
            {hasNextSource && onNextSource && (
              <Button className="rounded-full" onClick={onNextSource} autoFocus>
                <SkipForward className="mr-1.5 h-4 w-4" /> Try next source
              </Button>
            )}
            {onNextChannel && (
              <Button variant="outline" className="rounded-full border-border/70" onClick={onNextChannel}>
                <SkipForward className="mr-1.5 h-4 w-4" /> Next channel
              </Button>
            )}
            {onUseNative && (
              <Button variant="outline" className="rounded-full border-border/70" onClick={onUseNative}>
                <Tv className="mr-1.5 h-4 w-4" /> Try full-screen player
              </Button>
            )}
          </div>
        </div>
      )}

      {/* LIVE badge + channel */}
      {stream && status !== "error" && (
        seekable && duration > 0 && (
          <div className="absolute inset-x-3 bottom-14 z-10 flex items-center gap-2 rounded-md bg-black/65 px-2 py-1.5 text-[11px] text-white sm:inset-x-5">
            <span className="tabular-nums">{formatTime(currentTime)}</span>
            <Slider
              value={[Math.min(currentTime, duration)]}
              min={0}
              max={duration}
              step={1}
              onValueChange={([value]) => seekTo(value)}
              aria-label="Seek movie"
              className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:border-primary"
            />
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
        )
      )}

      {stream && status !== "error" && (
        <div
          className={cn(
            "pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur transition-opacity duration-200",
            showControls ? "opacity-100" : "opacity-0"
          )}
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
          <span className="text-[11px] font-bold tracking-wide text-white">LIVE</span>
          <span className="max-w-[40vw] truncate text-[11px] font-medium text-zinc-200">· {label}</span>
          {stream.quality && <span className="text-[11px] font-medium text-zinc-300">· {stream.quality}</span>}
        </div>
      )}

      {/* Control bar */}
      {stream && status !== "error" && (
        <div
          ref={controlsRef}
          className={cn(
            "absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200",
            showControls ? "opacity-100" : "opacity-0"
          )}
        >
          {seekable && (
            <Button variant="ghost" size="icon" className={controlButton} onClick={() => seekTo(currentTime - 10)} aria-label="Back 10 seconds">
              <Rewind className="h-5 w-5" />
            </Button>
          )}
          {onPreviousChannel && (
            <Button variant="ghost" size="icon" className={controlButton} onClick={onPreviousChannel} aria-label="Previous channel">
              <SkipBack className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={controlButton}
            onClick={togglePlay}
            aria-label={status === "paused" ? "Play" : "Pause"}
          >
            {status === "paused" ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
          </Button>
          {onNextChannel && (
            <Button variant="ghost" size="icon" className={controlButton} onClick={onNextChannel} aria-label="Next channel">
              <SkipForward className="h-5 w-5" />
            </Button>
          )}
          {seekable && (
            <Button variant="ghost" size="icon" className={controlButton} onClick={() => seekTo(currentTime + 10)} aria-label="Forward 10 seconds">
              <FastForward className="h-5 w-5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={controlButton}
            onClick={() => setMutedByUser(!muted)}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>

          {!isTv && (
            <div className="hidden w-24 sm:block">
              <Slider
                value={[muted ? 0 : volume]}
                max={1}
                step={0.05}
                onValueChange={([v]) => (v === 0 ? setMutedByUser(true) : changeVolume(v))}
                aria-label="Volume"
                className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:border-primary"
              />
            </div>
          )}

          <span className="ml-auto" />

          {onToggleFavorite && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(controlButton, isFavorite && "text-primary hover:text-primary")}
              onClick={onToggleFavorite}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={isFavorite}
            >
              <Heart className={cn("h-5 w-5", isFavorite && "fill-current")} />
            </Button>
          )}

          {(subtitles ?? []).length > 0 && (
            <Select value={activeSubtitle} onValueChange={(val) => setActiveSubtitle(val)}>
              <SelectTrigger
                className={cn(
                  "rounded-full border-white/20 bg-black/50 text-xs text-white [&>svg]:text-white",
                  isTv ? "h-11 w-[6.5rem]" : "h-9 w-[5.25rem] sm:w-[6.5rem]",
                )}
                aria-label="Subtitles"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Subtitles className="h-4 w-4 shrink-0" />
                  <SelectValue placeholder="Off" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                {(subtitles ?? []).map((track) => (
                  <SelectItem key={track.id} value={track.id}>
                    {track.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {levelOptions.length > 1 && (
            <Select
              value={String(currentLevel)}
              onValueChange={(val) => {
                const lvl = Number(val);
                setCurrentLevel(lvl);
                if (hlsRef.current) hlsRef.current.currentLevel = lvl;
              }}
            >
              <SelectTrigger
                className={cn(
                  "rounded-full border-white/20 bg-black/50 text-xs text-white [&>svg]:text-white",
                  isTv ? "h-11 w-[6.5rem]" : "h-9 w-[4.75rem] sm:w-[5.75rem]",
                )}
                aria-label="Quality"
              >
                <SelectValue placeholder="Auto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Auto</SelectItem>
                {levelOptions.map(([optionLabel, idx]) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {optionLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "hidden rounded-full px-2.5 text-xs text-white hover:bg-white/15 hover:text-white sm:inline-flex",
              isTv ? "h-11" : "h-9",
            )}
            onClick={() => setFitIndex((i) => (i + 1) % FIT_MODES.length)}
            aria-label={`Zoom: ${FIT_MODES[fitIndex].label}`}
          >
            <Scan className="mr-1 h-4 w-4" />
            {FIT_MODES[fitIndex].label}
          </Button>

          {!isTv && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(controlButton, "hidden sm:flex")}
              onClick={togglePip}
              aria-label="Picture in picture"
            >
              <PictureInPicture2 className="h-5 w-5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={controlButton}
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>
        </div>
      )}
    </div>
  );
}
