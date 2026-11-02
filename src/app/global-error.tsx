"use client";

/** Last-resort boundary: the root layout itself failed. Must render its own <html>/<body>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body style={{ margin: 0, background: "#09090b", color: "#fafaf9", fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            textAlign: "center",
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>StreamKaro could not start</h1>
          <p style={{ color: "#a1a1aa", maxWidth: 340 }}>Please reload the page. If it keeps happening, try again in a minute.</p>
          <button
            onClick={reset}
            style={{
              borderRadius: 999,
              background: "#f59e0b",
              color: "#111",
              border: 0,
              padding: "12px 22px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
