import Link from "next/link";

/**
 * Branded 404. Without this file Next renders its own light-on-white page inside what is a dark
 * product — and especially for deep links (`/watch/<bad-id>`) that looked like a crash.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="text-5xl" aria-hidden>
        📺
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          The link may be old or mistyped. Your channels are still where they were.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Go to Home
        </Link>
        <Link
          href="/live"
          className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-primary/50"
        >
          Live TV
        </Link>
      </div>
    </main>
  );
}
