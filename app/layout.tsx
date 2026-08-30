import type { Metadata, Viewport } from "next";
import "./globals.css";

import { I18nProvider } from "@/lib/i18n/context";

// English content: Zonostick's product default is English-first (see
// lib/i18n/context.tsx), and this static metadata is rendered before any
// client-side locale detection can run.
export const metadata: Metadata = {
  title: "Zonostick - AI Search Ranking Tracker",
  description:
    "Zonostick automatically tracks your brand's GEO (Generative Engine Optimization) ranking across ChatGPT, Claude, Perplexity, Gemini, Grok, and DeepSeek every morning, and alerts you on Slack the moment something shifts.",
};

// maximumScale: 1 stops iOS Safari's auto-zoom-on-input-focus (the
// underlying fix is text-base/16px on form fields - see globals.css -
// this is the belt-and-suspenders viewport-level half of that fix).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
