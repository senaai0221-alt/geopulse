"use client";

import { useEffect, useState } from "react";

// Deliberately not the shared i18n dictionary: I18nProvider lives inside
// app/layout.tsx, which this component replaces entirely (see below), so
// useI18n() isn't reachable here. Kept as its own tiny copy instead, using
// the same "English default, Japanese only on a clearly Japanese browser
// locale" rule as lib/i18n/context.tsx.
const COPY = {
  en: {
    title: "Something went wrong",
    description: "Please try again in a moment.",
    reload: "Reload",
  },
  ja: {
    title: "一時的に読み込めませんでした",
    description: "お手数ですが、もう一度お試しください。",
    reload: "再読み込み",
  },
} as const;

/**
 * Last-resort error boundary: only fires if the root layout itself
 * (app/layout.tsx) throws, which app/error.tsx can't catch. Must render
 * its own <html>/<body> since it replaces the entire root layout. Kept
 * deliberately plain (no shared UI components, no i18n provider) so it
 * can't itself fail to render for the same reason the page did.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  const [locale, setLocale] = useState<"en" | "ja">("en");

  useEffect(() => {
    setLocale(navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en");
  }, []);

  const copy = COPY[locale];

  return (
    <html lang={locale}>
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
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{copy.title}</h1>
          <p style={{ color: "#6b6785", marginBottom: 16, fontSize: 14 }}>{copy.description}</p>
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
            {copy.reload}
          </button>
        </div>
      </body>
    </html>
  );
}
