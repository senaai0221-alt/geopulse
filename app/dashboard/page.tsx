import Link from "next/link";
import { AlertTriangle, Bell, TrendingUp, Target } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";

import { BrandForm } from "./brand-form";
import { PromptForm } from "./prompt-form";
import { DeletePromptButton } from "./delete-prompt-button";
import { SlackSettingsForm } from "./slack-settings-form";
import { UpgradeButton } from "./upgrade-button";

const PROVIDERS = ["chatgpt", "claude", "perplexity", "gemini"] as const;
const PROVIDER_LABELS: Record<(typeof PROVIDERS)[number], string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

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
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  if (!brands || brands.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>最初のブランドを追加しましょう</CardTitle>
            <CardDescription>
              追跡したいブランド名と競合を登録すると、プロンプトの追加・毎朝の自動計測が始まります。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BrandForm />
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
    provider: string;
    mentioned: boolean;
    rank_position: number | null;
    checked_at: string;
  }
  const latestByKey = new Map<string, RankingRecord>();
  for (const r of (recentRankings ?? []) as RankingRecord[]) {
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

  return (
    <div className="flex flex-col gap-8">
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

      {/* KPI cards */}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Rankings table */}
          <Card>
            <CardHeader>
              <CardTitle>最新の推奨順位</CardTitle>
              <CardDescription>{selectedBrand.name} - プロンプト × LLM別の最新結果</CardDescription>
            </CardHeader>
            <CardContent>
              {!prompts || prompts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  まだプロンプトが登録されていません。下のフォームから追加してください。
                </p>
              ) : (
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
                    {prompts.map((prompt) => (
                      <TableRow key={prompt.id}>
                        <TableCell className="max-w-xs">{prompt.text}</TableCell>
                        {PROVIDERS.map((provider) => {
                          const r = latestByKey.get(`${prompt.id}-${provider}`);
                          return (
                            <TableCell key={provider}>
                              {r ? (
                                <RankBadge mentioned={r.mentioned} rank={r.rank_position} />
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
              )}
              <div className="mt-4 border-t border-border pt-4">
                <PromptForm brandId={selectedBrand.id} />
              </div>
            </CardContent>
          </Card>

          {/* Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>最近のアラート</CardTitle>
              <CardDescription>毎朝のバッチで検知された順位変動</CardDescription>
            </CardHeader>
            <CardContent>
              {!alerts || alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">まだアラートはありません。</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {alerts.map((alert) => (
                    <li key={alert.id} className="flex items-start gap-3 text-sm">
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
                      <div>
                        <p>{alert.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(alert.created_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Add another brand */}
          <Card>
            <CardHeader>
              <CardTitle>ブランドを追加</CardTitle>
            </CardHeader>
            <CardContent>
              <BrandForm />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {/* Slack settings */}
          <Card>
            <CardHeader>
              <CardTitle>Slack通知設定</CardTitle>
              <CardDescription>日次サマリーと異常検知アラートの送信先</CardDescription>
            </CardHeader>
            <CardContent>
              <SlackSettingsForm
                initialWebhookUrl={profile?.slack_webhook_url ?? null}
                initialEnabled={profile?.slack_enabled ?? false}
              />
            </CardContent>
          </Card>

          {/* Plan / upgrade */}
          <Card>
            <CardHeader>
              <CardTitle>プラン</CardTitle>
              <CardDescription>現在のプラン: {profile?.plan ?? "free"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {(profile?.plan ?? "free") === "free" && (
                <>
                  <UpgradeButton
                    priceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
                    label="Proにアップグレード"
                  />
                  <UpgradeButton
                    priceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
                    label="Businessにアップグレード"
                  />
                </>
              )}
              {(profile?.plan ?? "free") !== "free" && (
                <p className="text-sm text-muted-foreground">
                  ご契約ありがとうございます。プラン変更はサポートまでご連絡ください。
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
