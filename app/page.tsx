import Link from "next/link";
import { ArrowRight, Bell, LineChart, Sparkles, Slack, CheckCircle2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PROVIDERS = ["ChatGPT", "Claude", "Perplexity", "Gemini"];

const FEATURES = [
  {
    icon: LineChart,
    title: "毎朝自動計測",
    description:
      "4大LLMに対して登録済みのプロンプトを毎朝自動実行し、自社ブランドが何位で推奨されているかを記録します。",
  },
  {
    icon: Bell,
    title: "異常検知アラート",
    description:
      "順位が閾値以上悪化した、または推奨リストから消えた場合に自動で異常を検知します。",
  },
  {
    icon: Slack,
    title: "Slack通知",
    description:
      "検知した変動と日次サマリーをBlock Kit形式でSlackチャンネルに直接配信します。",
  },
  {
    icon: Sparkles,
    title: "競合トラッキング",
    description:
      "競合ブランドが同じプロンプトでどう推奨されているかも同時に可視化します。",
  },
];

const PLANS = [
  {
    name: "Pro",
    price: "¥9,800",
    period: "/月",
    description: "本格運用するチーム向け",
    features: [
      "5ブランドまで",
      "プロンプト無制限",
      "毎朝自動計測",
      "Slack異常検知アラート",
    ],
    cta: "Proを始める",
    highlighted: true,
  },
  {
    name: "Business",
    price: "¥29,800",
    period: "/月",
    description: "複数ブランド・代理店向け",
    features: [
      "ブランド無制限",
      "APIアクセス",
      "優先サポート",
      "カスタムアラート閾値",
    ],
    cta: "Businessを始める",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <main className="flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              ログイン
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
              今すぐ始める
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-24 text-center">
        <Badge variant="secondary" className="mb-4">
          GEO (Generative Engine Optimization) 対応
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          あなたのブランドは、
          <br />
          AIにどう推奨されていますか？
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          ChatGPT・Claude・Perplexity・Geminiにおける自社ブランドの推奨順位を毎朝自動計測。
          変動や異常値をSlackへリアルタイム通知するGEO追跡SaaSです。
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
            今すぐ始める <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link href="#pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            料金プランを見る
          </Link>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {PROVIDERS.map((p) => (
            <Badge key={p} variant="outline" className="px-4 py-1.5 text-sm">
              {p}
            </Badge>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            主要機能
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary" />
                  <CardTitle className="mt-2">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">料金プラン</h2>
          <p className="mt-3 text-center text-muted-foreground">
            チームの規模に合わせて選べる2つのプラン
          </p>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={plan.highlighted ? "border-primary shadow-lg ring-1 ring-primary" : ""}
              >
                <CardHeader>
                  {plan.highlighted && (
                    <Badge className="mb-2 w-fit">おすすめ</Badge>
                  )}
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/login"
                    className={cn(
                      buttonVariants({ variant: plan.highlighted ? "default" : "outline" }),
                      "w-full"
                    )}
                  >
                    {plan.cta}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} 株式会社ENDEVER. All rights reserved.</span>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              ログイン
            </Link>
            <Link href="/legal/tokushoho" className="hover:text-foreground">
              特定商取引法に基づく表示
            </Link>
            <Link href="/legal/terms" className="hover:text-foreground">
              利用規約
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground">
              プライバシーポリシー
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
