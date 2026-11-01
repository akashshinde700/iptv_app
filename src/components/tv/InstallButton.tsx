"use client";

import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getInstallPrompt } from "@/components/tv/AppShell";

/** "Install app" button that appears once the PWA install prompt is available. */
export function InstallButton() {
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const check = () => setCanInstall(!!getInstallPrompt());
    check();
    window.addEventListener("streamkaro:installable", check);
    window.addEventListener("appinstalled", () => {
      setCanInstall(false);
      toast.success("StreamKaro installed! Find it in your apps.");
    });
    return () => window.removeEventListener("streamkaro:installable", check);
  }, []);

  if (!canInstall) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 rounded-full border-border/70"
      onClick={async () => {
        const prompt = getInstallPrompt();
        if (!prompt) return;
        prompt.prompt();
        setCanInstall(false);
      }}
    >
      <MonitorDown className="mr-1.5 h-4 w-4" />
      Install App
    </Button>
  );
}
