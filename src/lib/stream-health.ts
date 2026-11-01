"use client";

/**
 * Tell the server how a stream played, so it can fail over and auto-disable a
 * consistently-dead source (never the channel). Fire-and-forget; the server
 * rate-limits and authorises. `keepalive` lets a failure report survive an
 * immediate source switch / unmount.
 */
export function reportStream(streamId: string | null | undefined, ok: boolean, error?: string): void {
  if (!streamId) return;
  try {
    fetch("/api/streams/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId, ok, error }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
