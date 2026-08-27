import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zonostick - AI検索順位トラッカー",
  description:
    "ChatGPT・Claude・Perplexity・GeminiにおけるブランドのGEO(生成エンジン最適化)順位を毎朝自動計測し、異常をSlackへ通知します。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
