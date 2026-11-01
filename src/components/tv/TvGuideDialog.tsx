"use client";

import { Cable, Chrome, Lightbulb, MonitorSmartphone,Tv, Usb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/lib/store";

const step =
  "flex items-start gap-3 rounded-lg border border-border/60 bg-card/60 p-3 text-sm leading-relaxed";
const stepNum =
  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary";

export function TvGuideDialog() {
  const open = useAppStore((s) => s.tvGuideOpen);
  const setOpen = useAppStore((s) => s.setTvGuideOpen);
  const setTvMode = useAppStore((s) => s.setTvMode);

  const enableTvMode = () => {
    setTvMode(true);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto thin-scrollbar sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Tv className="h-5 w-5 text-primary" />
            TV pe kaise chalayein?
          </DialogTitle>
          <DialogDescription>
            StreamKaro ko apne TV par dikhane ke 3 aasan tareeke — aapke TV ke type par depend karta hai.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="android-tv" className="mt-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="android-tv" className="text-xs sm:text-sm">
              <Usb className="mr-1 inline h-3.5 w-3.5 sm:mr-1.5 sm:h-4 sm:w-4" />
              Android TV / Fire TV
            </TabsTrigger>
            <TabsTrigger value="smart-tv" className="text-xs sm:text-sm">
              <Chrome className="mr-1 inline h-3.5 w-3.5 sm:mr-1.5 sm:h-4 sm:w-4" />
              Samsung / LG
            </TabsTrigger>
            <TabsTrigger value="old-tv" className="text-xs sm:text-sm">
              <Cable className="mr-1 inline h-3.5 w-3.5 sm:mr-1.5 sm:h-4 sm:w-4" />
              Purana TV
            </TabsTrigger>
          </TabsList>

          {/* Android TV / Fire TV — APK via pendrive */}
          <TabsContent value="android-tv" className="mt-3 space-y-2.5">
            <p className="text-sm text-muted-foreground">
              Mi / Sony / TCL / OnePlus / Fire TV Stick etc. — <b className="text-foreground">haan, pendrive se install hota hai!</b>
            </p>
            <div className={step}>
              <span className={stepNum}>1</span>
              <span>
                <b>APK banao:</b> is project ka <code className="rounded bg-muted px-1">android/</code> folder Android
                Studio me kholo aur <i>Build → Build APK</i> chalao (poori guide:{" "}
                <code className="rounded bg-muted px-1">docs/ANDROID_TV_APP.md</code>).
              </span>
            </div>
            <div className={step}>
              <span className={stepNum}>2</span>
              <span>
                APK file ko <b>pendrive</b> me copy karo.
              </span>
            </div>
            <div className={step}>
              <span className={stepNum}>3</span>
              <span>
                TV me: <b>Settings → Device Preferences → Security &amp; Restrictions → Unknown sources</b> = ON.
              </span>
            </div>
            <div className={step}>
              <span className={stepNum}>4</span>
              <span>
                Pendrive TV me lagao → <b>File Manager</b> kholo → APK par jao → <b>Install</b>. Bas — TV ke home
                screen par StreamKaro ka icon aa jayega! 🎉
              </span>
            </div>
            <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-muted-foreground">
              <b className="text-primary">Tip:</b> Fire TV Stick me pendrive na ho to &quot;Downloader&quot; app se APK ka
              link daal kar bhi install kar sakte ho.
            </p>
          </TabsContent>

          {/* Samsung / LG — built-in browser + TV Mode */}
          <TabsContent value="smart-tv" className="mt-3 space-y-2.5">
            <p className="text-sm text-muted-foreground">
              Samsung (Tizen) / LG (webOS) me APK install <b className="text-foreground">nahi hota</b>, lekin TV ke
              <b className="text-foreground"> built-in browser</b> me ye website kholo — remote se pura app chalta hai.
            </p>
            <div className={step}>
              <span className={stepNum}>1</span>
              <span>
                TV ke Apps me <b>Browser</b> kholo aur StreamKaro ka URL type karo.
              </span>
            </div>
            <div className={step}>
              <span className={stepNum}>2</span>
              <span>
                Header me <b>&quot;TV Mode&quot;</b> button ON karo — UI bada + remote ke arrow keys se navigation.
              </span>
            </div>
            <div className={step}>
              <span className={stepNum}>3</span>
              <span>
                Remote ke <b>arrow keys</b> se channel chuno, <b>OK / Enter</b> se play karo, <b>Back</b> se peeche.
              </span>
            </div>
            <button
              onClick={enableTvMode}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MonitorSmartphone className="h-4 w-4" />
              Abhi TV Mode ON karo
            </button>
          </TabsContent>

          {/* Old / non-smart TV */}
          <TabsContent value="old-tv" className="mt-3 space-y-2.5">
            <p className="text-sm text-muted-foreground">
              Purane TV me internet/apps nahi hote, lekin teen options se StreamKaro wahan bhi chalega:
            </p>
            <div className={step}>
              <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <b>Option A (sabse best):</b> Android TV box ya Fire TV Stick lagao (₹1,200–3,000). TV me HDMI se
                lagta hai, phir upar wala <b>pendrive/APK</b> tarika use karo.
              </span>
            </div>
            <div className={step}>
              <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <b>Option B:</b> Phone se <b>cast</b> karo — Chromecast / Fire TV Stick / TV ka screen-mirroring.
              </span>
            </div>
            <div className={step}>
              <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>
                <b>Option C:</b> Laptop ko <b>HDMI cable</b> se TV se jodo aur wahan StreamKaro (web ya desktop app)
                chalao.
              </span>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
