"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Crown,
  Download,
  Heart,
  Info,
  Lock,
  MonitorPlay,
  MonitorSmartphone,
  ListVideo,
  RefreshCw,
  UserRound,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { InstallButton } from "@/components/tv/InstallButton";
import { PlaylistDialog } from "@/components/tv/PlaylistDialog";
import { CHECK_UPDATE_EVENT } from "@/components/tv/UpdatePrompt";
import { APP_VERSION } from "@/lib/downloads";
import {
  getNativeAppInfo,
  hasNativePlugin,
  readPlayerEnginePreference,
  savePlayerEnginePreference,
  type NativeAppInfo,
} from "@/lib/native";
import { getIosShell } from "@/lib/ios-shell";
import { readMutedPreference, saveMutedPreference } from "@/lib/player-prefs";
import { useAppStore, useIsTv } from "@/lib/store";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-3xl border border-border/60 bg-card/50 p-2">
      <h2 className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="divide-y divide-border/50">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  title,
  description,
  children,
  htmlFor,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-4">
      <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block font-semibold">
          {title}
        </label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function SettingsView() {
  const navigate = useAppStore((s) => s.navigate);
  const tvMode = useAppStore((s) => s.tvMode);
  const setTvMode = useAppStore((s) => s.setTvMode);
  const platform = useAppStore((s) => s.platform);
  const isNativeShell = useAppStore((s) => s.isNativeShell);
  const setTvGuideOpen = useAppStore((s) => s.setTvGuideOpen);
  const setSupportOpen = useAppStore((s) => s.setSupportOpen);
  const isTv = useIsTv();

  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(() => !readMutedPreference());
  const [engine, setEngine] = useState(() => readPlayerEnginePreference());
  const [nativeInfo, setNativeInfo] = useState<NativeAppInfo | null>(null);
  // Non-null only inside the native iOS app (xtool shell). useSyncExternalStore
  // keeps this out of an effect, so server render stays null and hydration matches.
  const iosShell = useSyncExternalStore(noopSubscribe, getIosShell, () => null);
  const hasNativePlayer = hasNativePlugin("NativePlayer");
  const upiVpa = process.env.NEXT_PUBLIC_UPI_VPA;

  useEffect(() => {
    let cancelled = false;
    getNativeAppInfo().then((info) => {
      if (!cancelled) setNativeInfo(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveEngine = engine ?? (isTv ? "native" : "web");
  const chooseEngine = (next: "native" | "web") => {
    savePlayerEnginePreference(next);
    setEngine(next);
  };

  const optionClass = (selected: boolean) =>
    cn("rounded-full", selected ? "" : "border-border/70");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className={cn("font-extrabold tracking-tight", isTv ? "text-4xl" : "text-2xl sm:text-3xl")}>Settings</h1>
      <PlaylistDialog open={playlistOpen} onOpenChange={setPlaylistOpen} />

      <Section title="Display">
        {platform === "tv" ? (
          <Row icon={MonitorPlay} title="TV layout" description="Always on for this TV — built for your remote." />
        ) : (
          <Row
            icon={MonitorPlay}
            title="TV Mode"
            htmlFor="setting-tv-mode"
            description="Bigger layout you can drive with a TV remote or the arrow keys."
          >
            <Switch id="setting-tv-mode" checked={tvMode} onCheckedChange={setTvMode} data-autofocus />
          </Row>
        )}
      </Section>

      <Section title="Playback">
        <Row
          icon={Volume2}
          title="Start channels with sound"
          htmlFor="setting-sound"
          description="Turn off to always start muted. Browsers may still start muted until you interact with the page."
        >
          <Switch
            id="setting-sound"
            checked={soundOn}
            data-autofocus={platform === "tv" || undefined}
            onCheckedChange={(on) => {
              setSoundOn(on);
              saveMutedPreference(!on);
            }}
          />
        </Row>
        {hasNativePlayer && (
          <Row
            icon={MonitorSmartphone}
            title="Video player"
            description="The full-screen player plays more channel formats. The web player keeps the page visible."
          >
            <Button
              size="sm"
              variant={effectiveEngine === "native" ? "default" : "outline"}
              aria-pressed={effectiveEngine === "native"}
              className={optionClass(effectiveEngine === "native")}
              onClick={() => chooseEngine("native")}
            >
              Full-screen
            </Button>
            <Button
              size="sm"
              variant={effectiveEngine === "web" ? "default" : "outline"}
              aria-pressed={effectiveEngine === "web"}
              className={optionClass(effectiveEngine === "web")}
              onClick={() => chooseEngine("web")}
            >
              Web
            </Button>
          </Row>
        )}
      </Section>

      <Section title="Account">
        <Row icon={UserRound} title="Profile" description="Login, devices and log out.">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate({ name: "account" })}>
            Open
          </Button>
        </Row>
        <Row icon={Crown} title="Subscription" description="Your plan, expiry and available plans.">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate({ name: "premium" })}>
            Open
          </Button>
        </Row>
      </Section>

      {iosShell && (
        <Section title="StreamKaro app">
          <Row
            icon={MonitorSmartphone}
            title="App server"
            description="The address this app loads. Change it if your StreamKaro website moves to a new domain."
          >
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => iosShell.openSettings()}>
              Change
            </Button>
          </Row>
        </Section>
      )}

      <Section title="Watch anywhere">
        <Row
          icon={ListVideo}
          title="Playlist for other apps"
          description="One link for VLC, TiviMate, Kodi or any IPTV player — dead channels are skipped automatically."
        >
          <Button variant="outline" className="rounded-full" onClick={() => setPlaylistOpen(true)}>
            Get link
          </Button>
        </Row>
      </Section>

      <Section title="Help & apps">
        <Row icon={MonitorSmartphone} title="Watch on TV" description="How to install StreamKaro on Android TV, Fire TV, Samsung and LG.">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setTvGuideOpen(true)}>
            Open guide
          </Button>
        </Row>
        {!isNativeShell && platform === "web" && (
          <Row icon={Download} title="Get the apps" description="iPhone, iPad, Android, Android TV and Windows.">
            <InstallButton />
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate({ name: "download" })}>
              Downloads
            </Button>
          </Row>
        )}
        {upiVpa && (
          <Row icon={Heart} title="Support StreamKaro" description="Contribute directly via UPI.">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setSupportOpen(true)}>
              Support
            </Button>
          </Row>
        )}
      </Section>

      <Section title="About">
        <Row
          icon={Info}
          title="Version"
          description={
            nativeInfo
              ? `App ${nativeInfo.versionName} (${nativeInfo.flavor === "tv" ? "Android TV" : "Android"})`
              : iosShell
                ? `iOS app ${APP_VERSION}`
                : `Web ${APP_VERSION}`
          }
        >
          {hasNativePlugin("AppUpdater") && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => window.dispatchEvent(new Event(CHECK_UPDATE_EVENT))}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Check for updates
            </Button>
          )}
        </Row>
      </Section>

      {!isNativeShell && !isTv && (
        <Section title="Operators">
          <Row icon={Lock} title="Admin panel" description="For your provider's staff — manage channels, plans and customers.">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate({ name: "admin" })}>
              Open
            </Button>
          </Row>
        </Section>
      )}
    </div>
  );
}
