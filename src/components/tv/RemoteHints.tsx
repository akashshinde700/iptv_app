"use client";

import { useState } from "react";
import { Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsTv } from "@/lib/store";

const SEEN_KEY = "sk-remote-hints";

const HINTS: [string, string][] = [
  ["↑ ↓ ← →", "Move around"],
  ["OK", "Open a channel / select"],
  ["Back", "Go back one step"],
  ["↑ ↓ while watching", "Previous / next channel"],
  ["OK while watching", "Show the player controls"],
];

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

/** One short screen on the first TV launch — how the remote works. Never shown again. */
export function RemoteHints() {
  const isTv = useIsTv();
  const [open, setOpen] = useState(() => !alreadySeen());

  if (!isTv) return null;

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg" data-remote-hints>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Tv className="h-6 w-6 text-primary" aria-hidden /> Using your remote
          </DialogTitle>
          <DialogDescription className="text-base">Everything works with the arrow keys, OK and Back.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2">
          {HINTS.map(([key, action]) => (
            <div key={key} className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5">
              <dt className="min-w-[9rem] text-lg font-bold text-primary">{key}</dt>
              <dd className="text-lg">{action}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button className="h-12 min-w-32 rounded-full text-lg" autoFocus onClick={close}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
