import type { Metadata, Viewport } from "next";
import "./globals.css";

import { I18nProvider } from "@/lib/i18n/context";

export const metadata: Metadata = {
  title: "Zonostick - AI検索順位トラッカー",
  description:
    "ChatGPT・Claude・Perplexity・GeminiにおけるブランドのGEO(生成エンジン最適化)順位を毎朝自動計測し、異常をSlackへ通知します。",
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
    <html lang="ja">
      <body className="min-h-screen antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
