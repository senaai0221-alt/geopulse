"use client";

/**
 * Last-resort error boundary: only fires if the root layout itself
 * (app/layout.tsx) throws, which app/error.tsx can't catch. Must render
 * its own <html>/<body> since it replaces the entire root layout. Kept
 * deliberately plain (no shared UI components) so it can't itself fail
 * to render for the same reason the page did.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ja">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8f7fb",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            一時的に読み込めませんでした
          </h1>
          <p style={{ color: "#6b6785", marginBottom: 16, fontSize: 14 }}>
            お手数ですが、もう一度お試しください。
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            再読み込み
          </button>
        </div>
      </body>
    </html>
  );
}
