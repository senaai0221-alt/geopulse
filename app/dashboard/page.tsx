import Link from "next/link";
import { format } from "date-fns";
import { AlertTriangle, Bell, TrendingUp, Target, Link2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/geo-engine";
import { cn, formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { RankTrendChart, type TrendPoint } from "@/components/rank-trend-chart";
import { ShareOfVoice, type ShareOfVoiceEntry } from "@/components/share-of-voice";

import { BrandForm } from "./brand-form";
import { PromptForm } from "./prompt-form";
import { DeletePromptButton } from "./delete-prompt-button";
import { UpgradeButton } from "./upgrade-button";

const PROVIDERS = LLM_PROVIDERS;
const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

const UNCATEGORIZED = "__uncategorized__";
const VISIBLE_ALERTS = 3;

function RankBadge({
  mentioned,
  rank,
}: {
  mentioned: boolean;
  rank: number | null;
}) {
  if (!mentioned) {
    return <Badge variant="destructive">圏外</Badge>;
  }
  if (rank === null) {
    return <Badge variant="secondary">言及あり</Badge>;
  }
  if (rank <= 3) {
    return <Badge variant="success">#{rank}</Badge>;
  }
  return <Badge variant="warning">#{rank}</Badge>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "好意的",
  neutral: "中立的",
  negative: "否定的",
};
const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-slate-400",
  negative: "bg-destructive",
};

function SentimentDot({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return null;
  return (
    <span
      title={`論調: ${SENTIMENT_LABEL[sentiment] ?? sentiment}`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", SENTIMENT_DOT[sentiment])}
    />
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { brand?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: brands }, { data: profile }] = await Promise.all([
    supabase.from("brands").select("*").order("created_at", { ascending: true }),
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
  ]);
  const plan = profile?.plan ?? "free";

  if (!brands || brands.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {plan === "free" ? "プランのご契約が必要です" : "最初のブランドを追加しましょう"}
            </CardTitle>
            <CardDescription>
              {plan === "free"
                ? "Zonostickは有料プラン(Pro/Business)でご利用いただけます。プランをご契約いただくと、ブランドの追加・毎朝の自動計測が始まります。"
                : "追跡したいブランド名と競合を登録すると、プロンプトの追加・毎朝の自動計測が始まります。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "free" ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <UpgradeButton
                  priceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
                  label="Proにアップグレード"
                />
                <UpgradeButton
                  priceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
                  label="Businessにアップグレード"
                />
              </div>
            ) : (
              <BrandForm />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedBrand =
    brands.find((b) => b.id === searchParams.brand) ?? brands[0];

  const [{ data: prompts }, { data: recentRankings }, { data: alerts }] = await Promise.all([
    supabase
      .from("prompts")
      .select("*")
      .eq("brand_id", selectedBrand.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("rankings")
      .select("*")
      .eq("brand_id", selectedBrand.id)
      .order("checked_at", { ascending: false })
      .limit(1000),
    supabase
      .from("alerts")
      .select("*")
      .eq("brand_id", selectedBrand.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Keep only the most recent ranking per (prompt_id, provider) pair.
  interface RankingRecord {
    id: string;
    prompt_id: string;
    provider: LlmProvider;
    mentioned: boolean;
    rank_position: number | null;
    sentiment: string | null;
    competitors_mentioned: string[];
    citations: string[];
    checked_at: string;
  }
  const allRankings = (recentRankings ?? []) as RankingRecord[];

  const latestByKey = new Map<string, RankingRecord>();
  for (const r of allRankings) {
    const key = `${r.prompt_id}-${r.provider}`;
    if (!latestByKey.has(key)) latestByKey.set(key, r);
  }

  const latestList = Array.from(latestByKey.values());
  const mentionedCount = latestList.filter((r) => r.mentioned).length;
  const mentionRate = latestList.length > 0 ? mentionedCount / latestList.length : 0;
  const ranked = latestList.filter((r) => r.rank_position !== null);
  const avgRank =
    ranked.length > 0
      ? ranked.reduce((sum, r) => sum + (r.rank_position ?? 0), 0) / ranked.length
      : null;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const alertsThisWeek = (alerts ?? []).filter(
    (a) => new Date(a.created_at) >= oneWeekAgo
  ).length;

  // Group prompts by their optional category ("cohort"). Prompts without a
  // category fall into a single UNCATEGORIZED bucket; if that ends up being
  // the only bucket, we skip showing group headers entirely.
  interface PromptRecord {
    id: string;
    text: string;
    category: string | null;
  }
  const promptGroups = new Map<string, PromptRecord[]>();
  for (const prompt of (prompts ?? []) as PromptRecord[]) {
    const key = prompt.category?.trim() || UNCATEGORIZED;
    if (!promptGroups.has(key)) promptGroups.set(key, []);
    promptGroups.get(key)!.push(prompt);
  }
  const showGroupHeadings = !(promptGroups.size === 1 && promptGroups.has(UNCATEGORIZED));

  // Share of voice: how often the brand vs. each known competitor turned up
  // across the latest measurement round.
  const competitorNames: string[] = selectedBrand.competitors ?? [];
  const shareOfVoiceEntries: ShareOfVoiceEntry[] = [
    { name: selectedBrand.name, count: mentionedCount, isBrand: true },
    ...competitorNames.map((name) => ({
      name,
      count: latestList.filter((r) => r.competitors_mentioned?.includes(name)).length,
      isBrand: false,
    })),
  ];

  // Rank trend: average rank position per day per provider, across every
  // measurement round on record for this brand (not just the latest).
  function emptyProviderBuckets(): Record<LlmProvider, { sum: number; count: number }> {
    const bucket = {} as Record<LlmProvider, { sum: number; count: number }>;
    for (const p of PROVIDERS) bucket[p] = { sum: 0, count: 0 };
    return bucket;
  }

  const trendBuckets = new Map<string, Record<LlmProvider, { sum: number; count: number }>>();
  for (const r of allRankings) {
    if (r.rank_position === null) continue;
    const dateKey = format(new Date(r.checked_at), "yyyy-MM-dd");
    if (!trendBuckets.has(dateKey)) {
      trendBuckets.set(dateKey, emptyProviderBuckets());
    }
    const bucket = trendBuckets.get(dateKey)!;
    bucket[r.provider].sum += r.rank_position;
    bucket[r.provider].count += 1;
  }
  const trendData: TrendPoint[] = Array.from(trendBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, byProvider]) => {
      const point = { date: format(new Date(dateKey), "M/d") } as TrendPoint;
      for (const p of PROVIDERS) {
        point[p] = byProvider[p].count > 0 ? round1(byProvider[p].sum / byProvider[p].count) : null;
      }
      return point;
    });

  const visibleAlerts = (alerts ?? []).slice(0, VISIBLE_ALERTS);

  return (
    <div className="flex flex-col gap-6">
      {/* Brand switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {brands.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard?brand=${b.id}`}
            className={cn(
              buttonVariants({
                variant: b.id === selectedBrand.id ? "default" : "outline",
                size: "sm",
              })
            )}
          >
            {b.name}
          </Link>
        ))}
      </div>

      {/* KPI cards - top row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">言及率</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(mentionRate * 100)}%</div>
            <p className="text-xs text-muted-foreground">直近の計測に基づく</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">平均順位</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgRank ? avgRank.toFixed(1) : "-"}</div>
            <p className="text-xs text-muted-foreground">ランク付けされた回答のみ</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              直近7日間のアラート
            </CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertsThisWeek}</div>
            <p className="text-xs text-muted-foreground">順位異常の検知件数</p>
          </CardContent>
        </Card>
      </div>

      {/* Main table - prompt form compact on top */}
      <Card>
        <CardHeader>
          <CardTitle>最新の推奨順位</CardTitle>
          <CardDescription>{selectedBrand.name} - プロンプト × LLM別の最新結果</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PromptForm brandId={selectedBrand.id} />

          {!prompts || prompts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              まだプロンプトが登録されていません。上のフォームから追加してください。
            </p>
          ) : (
            <div className="flex flex-col gap-6 border-t border-border pt-4">
              {Array.from(promptGroups.entries()).map(([groupKey, groupPrompts]) => (
                <div key={groupKey} className="flex flex-col gap-2">
                  {showGroupHeadings && (
                    <h4 className="text-sm font-semibold text-foreground">
                      {groupKey === UNCATEGORIZED ? "未分類" : groupKey}
                    </h4>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>プロンプト</TableHead>
                        {PROVIDERS.map((p) => (
                          <TableHead key={p}>{PROVIDER_LABELS[p]}</TableHead>
                        ))}
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupPrompts.map((prompt) => (
                        <TableRow key={prompt.id}>
                          <TableCell className="max-w-xs">{prompt.text}</TableCell>
                          {PROVIDERS.map((provider) => {
                            const r = latestByKey.get(`${prompt.id}-${provider}`);
                            return (
                              <TableCell key={provider}>
                                {r ? (
                                  <div className="flex items-center gap-1.5">
                                    <RankBadge mentioned={r.mentioned} rank={r.rank_position} />
                                    <SentimentDot sentiment={r.sentiment} />
                                    {r.citations && r.citations.length > 0 && (
                                      <span
                                        title={r.citations.join("\n")}
                                        className="inline-flex cursor-help items-center gap-0.5 text-xs text-muted-foreground"
                                      >
                                        <Link2 className="h-3 w-3" />
                                        {r.citations.length}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">未計測</span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell>
                            <DeletePromptButton promptId={prompt.id} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom row - trend + share of voice side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>順位トレンド</CardTitle>
            <CardDescription>LLMごとの平均順位の推移(日次)</CardDescription>
          </CardHeader>
          <CardContent>
            <RankTrendChart data={trendData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>競合との言及シェア</CardTitle>
            <CardDescription>{selectedBrand.name}と競合の、直近の言及割合</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareOfVoice entries={shareOfVoiceEntries} total={latestList.length} />
          </CardContent>
        </Card>
      </div>

      {/* Recent alerts - compact */}
      <Card>
        <CardHeader>
          <CardTitle>最近のアラート</CardTitle>
          <CardDescription>毎朝のバッチで検知された順位変動</CardDescription>
        </CardHeader>
        <CardContent>
          {visibleAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだアラートはありません。</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {visibleAlerts.map((alert) => (
                <li key={alert.id} className="flex items-start gap-2.5 text-sm">
                  <AlertTriangle
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      alert.severity === "critical"
                        ? "text-destructive"
                        : alert.severity === "warning"
                        ? "text-amber-500"
                        : "text-muted-foreground"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(alert.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {alerts && alerts.length > VISIBLE_ALERTS && (
            <p className="mt-3 text-xs text-muted-foreground">
              他 {alerts.length - VISIBLE_ALERTS} 件のアラートがあります。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
