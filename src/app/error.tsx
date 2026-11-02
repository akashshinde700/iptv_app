"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. A render or data error used to surface Next's default screen
 * (which is not themed and offers a reload that loses the session view state).
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced in the server/browser log for support; never shown to the viewer.
    console.error("app error boundary:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="text-5xl" aria-hidden>
        ⚠️
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          This screen hit an error. Trying again usually fixes it — your plan and favourites are safe.
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        Try again
      </button>
    </main>
  );
}
