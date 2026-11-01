"use client";

import { LogOut } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getIosShell } from "@/lib/ios-shell";
import { exitNativeApp } from "@/lib/native";
import { useAppStore } from "@/lib/store";

/**
 * Shown by the Back pipeline when the user presses Back on Home inside a native
 * shell. Cancel has focus (Radix focuses it first); Back again = Cancel.
 *
 * iOS note: apps may not quit themselves (App Store rule 2.5.1), so on iOS this
 * explains how to leave instead of pretending a button can close the app.
 */
export function ExitConfirmDialog() {
  const open = useAppStore((s) => s.exitConfirmOpen);
  const setOpen = useAppStore((s) => s.setExitConfirmOpen);
  // Only ever rendered after mount (the dialog is closed on the server render).
  const onIos = getIosShell() !== null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-xl">
            <LogOut className="h-5 w-5 text-primary" aria-hidden /> Exit StreamKaro?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            {onIos ? "Swipe up from the bottom edge of the screen to leave StreamKaro." : "Do you want to exit the application?"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="h-11 min-w-28 rounded-full text-base">Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="h-11 min-w-28 rounded-full bg-destructive text-base text-white hover:bg-destructive/90"
            onClick={() => {
              if (onIos) setOpen(false);
              else void exitNativeApp();
            }}
          >
            Exit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
