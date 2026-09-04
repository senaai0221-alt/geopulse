import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Target,
  Link2,
  Loader2,
  ListChecks,
  LineChart,
  PieChart,
  Rocket,
  Settings2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/geo-engine";
import { cn, formatDate } from "@/lib/utils";
import { formatJst, jstDateKey } from "@/lib/jst";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { type TrendPoint } from "@/components/rank-trend-chart";
import { type ExposureTrendPoint } from "@/components/exposure-trend-chart";
import { type VoiceTrendPoint } from "@/components/voice-trend-chart";
import { TrendExplorer } from "@/components/trend-explorer";
import { DashboardKpiCards, type DailyStatsPoint, type DailyAlertPoint } from "@/components/dashboard-kpi-cards";
import { DashboardPeriodProvider } from "@/components/dashboard-period-context";
import { DashboardPeriodSelector } from "@/components/dashboard-period-selector";
import { getMarketingActions } from "@/lib/marketing-actions";
import { ShareOfVoice, type ShareOfVoiceEntry } from "@/components/share-of-voice";
import { T } from "@/components/t";
import { InfoTooltip } from "@/components/info-tooltip";

import { BrandForm } from "./brand-form";
import { PromptForm } from "./prompt-form";
import { DeletePromptButton } from "./delete-prompt-button";
import { EditPromptGroupButton } from "./edit-prompt-group-button";
import { UpgradePrompt } from "./upgrade-button";
import { RankBadge, SentimentDot, RawResponseButton, CheckErrorBadge, PromptPausedBadge } from "./result-cell";
import { AlertLink } from "./alert-link";

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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <T k={plan === "free" ? "dashboard.needSubscription" : "dashboard.firstBrand"} />
            </CardTitle>
            <CardDescription>
              <T k={plan === "free" ? "dashboard.needSubscriptionDesc" : "dashboard.firstBrandDesc"} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            {plan === "free" ? (
              <UpgradePrompt
                proPriceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
                businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
              />
            ) : (
              <BrandForm businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedBrand =
    brands.find((b) => b.id === searchParams.brand) ?? brands[0];

  // Bounded by a 90-day date range (not just a row-count limit) so the
  // trend explorer's 90-day view is always fully covered regardless of
  // how many prompts x providers this brand runs - a limit(1000) could
  // silently truncate to well under 90 days for an active Business
  // account (10 prompts x 6 providers x 90 days = 5400 rows). The
  // row cap below is just a sane upper-bound safety net on top of that.
  const trendWindowStart = new Date();
  trendWindowStart.setDate(trendWindowStart.getDate() - 90);
  // Exclusive end one day out, not "now" - a same-day action logged
  // later today must still show up (getMarketingActions filters on the
  // action_date column, not a timestamp, so "today" needs to be fully
  // inside the range).
  const trendWindowEnd = new Date();
  trendWindowEnd.setDate(trendWindowEnd.getDate() + 1);

  const [{ data: prompts }, { data: recentRankings }, { data: alerts }, { data: alertDates }, marketingActions] = await Promise.all([
    supabase
      .from("prompts")
      .select("*")
      .eq("brand_id", selectedBrand.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("rankings")
      .select("*")
      .eq("brand_id", selectedBrand.id)
      .gte("checked_at", trendWindowStart.toISOString())
      .order("checked_at", { ascending: false })
      .limit(20000),
    supabase
      // Joins the exact rankings row this alert was built from
      // (ranking_id, added 2026-09) so the timestamp shown here is the
      // SAME record the alert email used, not `alerts.created_at` -
      // which is whenever this insert happened to run, potentially
      // seconds apart from the check itself under concurrent
      // processing - see this fix's report for the reported "email and
      // dashboard show different times" incident. Falls back to
      // `alerts.created_at` for rows written before ranking_id existed
      // (ranking is then null).
      .from("alerts")
      .select("*, ranking:rankings(checked_at)")
      .eq("brand_id", selectedBrand.id)
      .order("created_at", { ascending: false })
      .limit(10),
    // A separate, uncapped fetch for the KPI cards' own period-selector
    // (see components/dashboard-kpi-cards.tsx) - the query above is
    // deliberately capped at 10 rows for the "最近のアラート" list
    // display, and reusing that same capped array to COUNT alerts over
    // any window silently floors the count at 10 for any brand active
    // enough to generate more in that window (found running a
    // deliberately alert-heavy multi-day demo: 47 real alerts across 3
    // brands, but a fixed "直近7日間のアラート" card built off the
    // capped list topped out at whatever fit in it instead of the
    // brand's real count - same root cause, now generalized to every
    // selectable period instead of just re-fixing the one fixed-7-day
    // case). Bounded to the same 90-day window as rankings/trend data,
    // matching the KPI cards' own longest selectable period.
    supabase
      .from("alerts")
      .select("created_at")
      .eq("brand_id", selectedBrand.id)
      .gte("created_at", trendWindowStart.toISOString()),
    getMarketingActions(supabase, selectedBrand.id, { start: trendWindowStart, end: trendWindowEnd }),
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
    raw_response: string | null;
    checked_at: string;
    error: string | null;
  }
  const allRankings = (recentRankings ?? []) as RankingRecord[];

  const latestByKey = new Map<string, RankingRecord>();
  const promptsWithAnyData = new Set<string>();
  // How many rows exist for a given (prompt, provider) pair within the
  // 90-day window - used only to tell a genuinely-first-ever check that
  // failed (count === 1: the failed row itself, nothing else) apart
  // from a later one (see CheckErrorBadge's isFirstCheck prop). Below
  // 2 either way behaves the same for this purpose, so this only
  // needs to distinguish "exactly one" from "more than one," not count
  // precisely - but a Map of counts is just as simple to build as a Set.
  const checkCountByKey = new Map<string, number>();
  // How many checks IN A ROW, most-recent-first, have failed for a
  // given (prompt, provider) - used by CheckErrorBadge to stop
  // promising "usually clears up by tomorrow" once that promise has
  // already been wrong for multiple days straight (see that
  // component's own comment for the real incident this fixes: an
  // invalid provider API key doesn't self-heal, but the old copy never
  // said so no matter how many consecutive mornings it failed).
  // `allRankings` is already ordered newest-first, so walking it once
  // and stopping each key's count the first time a SUCCESSFUL row is
  // hit for that key gives exactly "the current unbroken failure
  // streak, most recent backward" - no second pass/sort needed.
  const consecutiveFailuresByKey = new Map<string, number>();
  const failureStreakEndedByKey = new Set<string>();
  for (const r of allRankings) {
    const key = `${r.prompt_id}-${r.provider}`;
    if (!latestByKey.has(key)) latestByKey.set(key, r);
    checkCountByKey.set(key, (checkCountByKey.get(key) ?? 0) + 1);
    promptsWithAnyData.add(r.prompt_id);

    if (!failureStreakEndedByKey.has(key)) {
      if (r.error) {
        consecutiveFailuresByKey.set(key, (consecutiveFailuresByKey.get(key) ?? 0) + 1);
      } else {
        failureStreakEndedByKey.add(key);
      }
    }
  }

  const latestList = Array.from(latestByKey.values());
  const mentionedCount = latestList.filter((r) => r.mentioned).length;

  // Group prompts by their optional category ("cohort"). Prompts without a
  // category fall into a single UNCATEGORIZED bucket; if that ends up being
  // the only bucket, we skip showing group headers entirely.
  interface PromptRecord {
    id: string;
    text: string;
    category: string | null;
    is_active: boolean;
  }
  const promptGroups = new Map<string, PromptRecord[]>();
  for (const prompt of (prompts ?? []) as PromptRecord[]) {
    const key = prompt.category?.trim() || UNCATEGORIZED;
    if (!promptGroups.has(key)) promptGroups.set(key, []);
    promptGroups.get(key)!.push(prompt);
  }
  const showGroupHeadings = !(promptGroups.size === 1 && promptGroups.has(UNCATEGORIZED));
  // Offered as autocomplete suggestions when adding/editing a prompt's
  // category - see PromptForm/EditPromptGroupButton.
  const existingCategories = Array.from(promptGroups.keys()).filter((k) => k !== UNCATEGORIZED);

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

  // One pass over the (up to 90-day) rankings builds every daily series
  // the trend explorer needs - rank position per provider (existing),
  // AI exposure rate, and Share of Voice per entity (both new) - so
  // switching between them client-side (see TrendExplorer) never needs
  // another fetch, just a different set of keys off the same points.
  interface DayBucket {
    providerRank: Record<LlmProvider, { sum: number; count: number }>;
    mentioned: number;
    /** Subset of `mentioned` whose lib/geo-engine.ts sentiment judge
     *  (judgeBrandTreatment) returned "positive" - see DailyStatsPoint's
     *  own comment (dashboard-kpi-cards.tsx) for why AI推奨率 divides
     *  this by `total`, not by `mentioned`. */
    positiveMentioned: number;
    total: number;
    entityMentions: Record<string, number>;
  }
  function emptyDayBucket(): DayBucket {
    const providerRank = {} as Record<LlmProvider, { sum: number; count: number }>;
    for (const p of PROVIDERS) providerRank[p] = { sum: 0, count: 0 };
    return { providerRank, mentioned: 0, positiveMentioned: 0, total: 0, entityMentions: {} };
  }

  const dayBuckets = new Map<string, DayBucket>();
  for (const r of allRankings) {
    // JST calendar day (see lib/jst.ts) - the daily cron runs at
    // 07:00-07:30 JST, which is still the previous UTC calendar day on
    // Vercel's own (UTC) server clock, so a plain date-fns format()
    // here silently bucketed every single cron-written row into
    // yesterday's trend-chart point.
    const dateKey = jstDateKey(r.checked_at);
    if (!dayBuckets.has(dateKey)) dayBuckets.set(dateKey, emptyDayBucket());
    const bucket = dayBuckets.get(dateKey)!;

    bucket.total += 1;
    if (r.mentioned) {
      bucket.mentioned += 1;
      if (r.sentiment === "positive") bucket.positiveMentioned += 1;
      bucket.entityMentions[selectedBrand.name] = (bucket.entityMentions[selectedBrand.name] ?? 0) + 1;
    }
    for (const name of competitorNames) {
      if (r.competitors_mentioned?.includes(name)) {
        bucket.entityMentions[name] = (bucket.entityMentions[name] ?? 0) + 1;
      }
    }
    if (r.rank_position !== null) {
      bucket.providerRank[r.provider].sum += r.rank_position;
      bucket.providerRank[r.provider].count += 1;
    }
  }

  const sortedDayKeys = Array.from(dayBuckets.keys()).sort();
  const voiceEntities = [selectedBrand.name, ...competitorNames];

  const trendData: TrendPoint[] = sortedDayKeys.map((dateKey) => {
    const b = dayBuckets.get(dateKey)!;
    const point = { date: formatJst(new Date(dateKey), "M/d") } as TrendPoint;
    for (const p of PROVIDERS) {
      point[p] = b.providerRank[p].count > 0 ? round1(b.providerRank[p].sum / b.providerRank[p].count) : null;
    }
    return point;
  });

  const exposureTrendData: ExposureTrendPoint[] = sortedDayKeys.map((dateKey) => {
    const b = dayBuckets.get(dateKey)!;
    return {
      date: formatJst(new Date(dateKey), "M/d"),
      exposureRate: b.total > 0 ? round1((b.mentioned / b.total) * 100) : null,
    };
  });

  const voiceTrendData: VoiceTrendPoint[] = sortedDayKeys.map((dateKey) => {
    const b = dayBuckets.get(dateKey)!;
    const entityTotal = Object.values(b.entityMentions).reduce((sum, c) => sum + c, 0);
    const point = { date: formatJst(new Date(dateKey), "M/d") } as VoiceTrendPoint;
    for (const name of voiceEntities) {
      const count = b.entityMentions[name] ?? 0;
      point[name] = entityTotal > 0 ? round1((count / entityTotal) * 100) : null;
    }
    return point;
  });

  // Daily mentioned/total/rank totals, parallel to the trend arrays
  // above but kept summable across an arbitrary tail slice rather than
  // pre-flattened into one ratio per day - this is what lets the KPI
  // cards (DashboardKpiCards) report "選択期間全体の平均" for whichever
  // period is selected, instead of always the single latest
  // measurement with no stated time window (2026-09 fix).
  const dailyStats: DailyStatsPoint[] = sortedDayKeys.map((dateKey) => {
    const b = dayBuckets.get(dateKey)!;
    let rankSum = 0;
    let rankCount = 0;
    for (const p of PROVIDERS) {
      rankSum += b.providerRank[p].sum;
      rankCount += b.providerRank[p].count;
    }
    return {
      date: dateKey,
      mentioned: b.mentioned,
      positiveMentioned: b.positiveMentioned,
      total: b.total,
      rankSum,
      rankCount,
    };
  });

  // Same idea for the KPI row's alert count - a separate bucket map
  // since alerts are keyed by their own created_at, not the
  // rankings.checked_at the day buckets above are built from.
  const alertDayCounts = new Map<string, number>();
  for (const a of alertDates ?? []) {
    const dateKey = jstDateKey(a.created_at);
    alertDayCounts.set(dateKey, (alertDayCounts.get(dateKey) ?? 0) + 1);
  }
  const dailyAlerts: DailyAlertPoint[] = Array.from(alertDayCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const visibleAlerts = (alerts ?? []).slice(0, VISIBLE_ALERTS);

  // A brand exists (the `!brands` branch above already returned) but no
  // prompt has been added yet, so there is no ranking data of any kind -
  // the trend explorer below would just be an empty chart. Show a
  // 2-step "what do I do now" guide in its place instead, and highlight
  // the prompt input the guide is pointing at. Both flip back to normal
  // automatically the moment a prompt exists: createPrompt's
  // revalidatePath("/dashboard") (see actions.ts) re-runs this Server
  // Component, so `showOnboarding` just becomes false on its own - no
  // client-side dismiss state to manage.
  const showOnboarding = !prompts || prompts.length === 0;

  return (
    // Shared period (7/30/90 days) for the KPI cards and the trend
    // graph further down - see dashboard-period-context.tsx's own
    // comment for why this is a Context rather than lifted local state
    // (the two consumers are rendered nowhere near each other on this
    // page).
    <DashboardPeriodProvider>
    <div className="flex flex-col gap-6">
      {/* Brand switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {brands.map((b) => (
          <Link
            key={b.id}
            href={`/dashboard?brand=${b.id}`}
            title={b.name}
            className={cn(
              buttonVariants({
                variant: b.id === selectedBrand.id ? "default" : "outline",
                size: "sm",
              }),
              "max-w-[200px] truncate"
            )}
          >
            {b.name}
          </Link>
        ))}
      </div>

      {/* Global period toggle (2026-09, operator's own UX report from a
          screen recording): used to live ONLY inside TrendExplorer, the
          trend-graph card far down the page - even though it also
          drives the KPI cards right below this. Changing the period
          meant scrolling all the way down, clicking, then scrolling
          back up to see the KPI numbers actually change. One control
          here, right above everything it drives, removes that round
          trip - see dashboard-period-selector.tsx's own comment. */}
      <div className="flex items-center justify-end">
        <DashboardPeriodSelector />
      </div>

      {/* Zero-mention warning + KPI cards (露出率/平均順位/アラート),
          all scoped to one shared, switchable period - see
          DashboardKpiCards and dashboard-period-context.tsx's own
          comments for why this replaced a plain snapshot of the
          single latest measurement with no stated time window. */}
      <DashboardKpiCards dailyStats={dailyStats} dailyAlerts={dailyAlerts} />

      {/* Onboarding guide - replaces the (otherwise empty) trend chart
          for a brand-new account, and points straight at the highlighted
          prompt input just below it. See `showOnboarding` above. */}
      {showOnboarding && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="text-xl">
              <T k="dashboard.onboardingTitle" />
            </CardTitle>
            <CardDescription>
              <T k="dashboard.onboardingDesc" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  1
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Target className="h-4 w-4 text-primary" />
                    <T k="dashboard.onboardingStep1Title" />
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    <T k="dashboard.onboardingStep1Desc" vars={{ name: selectedBrand.name }} />
                  </p>
                  <Link
                    href="/dashboard/settings"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    <T k="dashboard.onboardingStep1Cta" />
                  </Link>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  2
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Rocket className="h-4 w-4 text-primary" />
                    <T k="dashboard.onboardingStep2Title" />
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    <T k="dashboard.onboardingStep2Desc" />
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  3
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Bell className="h-4 w-4 text-primary" />
                    <T k="dashboard.onboardingStep3Title" />
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    <T k="dashboard.onboardingStep3Desc" />
                  </p>
                  {/* #email-alerts positions the scroll, ?highlight=alerts
                      drives the visual emphasis once there - see
                      settings/page.tsx. */}
                  <Link
                    href="/dashboard/settings?highlight=alerts#email-alerts"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
                  >
                    <Bell className="h-3.5 w-3.5" />
                    <T k="dashboard.onboardingStep3Cta" />
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main table - prompt form compact on top */}
      <Card>
        {/* The "A4レポートを開く" button that used to sit here moved to
            /dashboard/report itself (this card's header is just the
            title again, not a second home for a link to a page that
            already has its own nav entry). The CSV button that used to
            sit here too (2026-09) moved there as well - /dashboard/
            report now has its own Pro-tier view for exactly this link
            (Pro no longer needs a second home for it now that the
            report page isn't Business-only anymore - see that page's
            own isPro branch), so data export lives in one place instead
            of being scattered across dashboard and report. */}
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <T k="dashboard.latestRankings" />
            <InfoTooltip textKey="dashboard.latestRankingsTooltip" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PromptForm
            brandId={selectedBrand.id}
            businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
            highlight={showOnboarding}
          />

          {!prompts || prompts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <T k="dashboard.noPrompts" />
            </p>
          ) : (
            <div className="flex flex-col gap-6 border-t border-border pt-4">
              {Array.from(promptGroups.entries()).map(([groupKey, groupPrompts]) => (
                <div key={groupKey} className="flex flex-col gap-2">
                  {showGroupHeadings && (
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {groupKey === UNCATEGORIZED ? <T k="dashboard.uncategorized" /> : groupKey}
                      <InfoTooltip textKey="dashboard.categoryHeadingTooltip" />
                    </h4>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">
                          <T k="dashboard.prompt" />
                        </TableHead>
                        {PROVIDERS.map((p) => (
                          <TableHead key={p} className="whitespace-nowrap">
                            {PROVIDER_LABELS[p]}
                          </TableHead>
                        ))}
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupPrompts.map((prompt) => (
                        <TableRow key={prompt.id}>
                          {/* truncate (not wrap) + title so a long prompt
                              stays one line and is still readable on
                              hover - the table's own overflow-auto
                              wrapper (see ui/table.tsx) is what handles
                              the rest of the row not fitting, not this
                              cell wrapping internally. */}
                          <TableCell className="max-w-xs" title={prompt.text}>
                            <span className="flex items-center gap-1.5">
                              <span className="truncate">{prompt.text}</span>
                              {prompt.is_active === false && <PromptPausedBadge />}
                              {/* Only when there's no group heading
                                  already saying the same thing (see
                                  showGroupHeadings above) - repeating
                                  "選び方・おすすめ" as a badge on every
                                  row already sitting under that exact
                                  heading would just be noise. */}
                              {!showGroupHeadings && prompt.category && (
                                <Badge variant="outline" className="shrink-0 text-[11px]">
                                  {prompt.category}
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          {PROVIDERS.map((provider) => {
                            const key = `${prompt.id}-${provider}`;
                            const r = latestByKey.get(key);
                            const isFirstCheck = (checkCountByKey.get(key) ?? 0) <= 1;
                            const consecutiveFailures = consecutiveFailuresByKey.get(key) ?? 1;
                            return (
                              <TableCell
                                key={provider}
                                // Jump target for the "最近のアラート"
                                // card below (see AlertLink) - pinpoints
                                // the one LLM cell an alert is actually
                                // about, not the whole row, so landing
                                // here reads as "this is what changed,
                                // click the raw-answer icon next to it,"
                                // not just "you scrolled somewhere."
                                id={`result-${prompt.id}-${provider}`}
                                className="whitespace-nowrap"
                              >
                                {r ? (
                                  <div className="flex flex-nowrap items-center gap-1.5">
                                    <RankBadge mentioned={r.mentioned} rank={r.rank_position} />
                                    {r.error && (
                                      <CheckErrorBadge isFirstCheck={isFirstCheck} consecutiveFailures={consecutiveFailures} />
                                    )}
                                    <SentimentDot sentiment={r.sentiment} />
                                    {r.citations && r.citations.length > 0 && (
                                      <span
                                        title={r.citations.join("\n")}
                                        className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs text-muted-foreground cursor-help"
                                      >
                                        <Link2 className="h-3 w-3" />
                                        {r.citations.length}
                                      </span>
                                    )}
                                    <RawResponseButton
                                      rawResponse={r.raw_response}
                                      provider={PROVIDER_LABELS[provider]}
                                      promptText={prompt.text}
                                    />
                                  </div>
                                ) : promptsWithAnyData.has(prompt.id) ? (
                                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                                    <T k="dashboard.notMeasured" />
                                  </span>
                                ) : (
                                  <span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                                    <T k="dashboard.firstMeasuring" />
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell>
                            <div className="flex flex-nowrap items-center gap-1">
                              <EditPromptGroupButton
                                promptId={prompt.id}
                                currentCategory={prompt.category}
                                existingCategories={existingCategories}
                              />
                              <DeletePromptButton promptId={prompt.id} />
                            </div>
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

      {/* Trend explorer - full width: exposure rate / rank position /
          Share of Voice, each over a selectable 7/30/90-day window.
          Skipped during onboarding (see showOnboarding above) - with
          zero prompts there's no ranking data yet, so this would just
          render an empty chart where the guide card already sits. */}
      {!showOnboarding && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-primary" />
              <T k="dashboard.trend" />
            </CardTitle>
            <CardDescription>
              <T k="dashboard.trendDesc" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendExplorer
              brandId={selectedBrand.id}
              rankData={trendData}
              exposureData={exposureTrendData}
              voiceData={voiceTrendData}
              voiceEntities={voiceEntities}
              actions={marketingActions}
            />
          </CardContent>
        </Card>
      )}

      {/* Share of voice snapshot + recent alerts side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              <T k="dashboard.shareOfVoice" />
            </CardTitle>
            <CardDescription>
              <T k="dashboard.shareOfVoiceDesc" vars={{ name: selectedBrand.name }} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShareOfVoice entries={shareOfVoiceEntries} total={latestList.length} brandId={selectedBrand.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <T k="dashboard.recentAlerts" />
            </CardTitle>
            <CardDescription>
              <T k="dashboard.recentAlertsDesc" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            {visibleAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <T k="dashboard.noAlerts" />
              </p>
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
                    {/* Wraps instead of truncating - an alert that cuts
                        itself off mid-sentence reads as "so what am I
                        supposed to do about this?", not just illegible.
                        Jumps to (and spotlights) the exact LLM cell this
                        alert is about in the prompt table below (see
                        AlertLink) - a concrete next step: see the actual
                        AI answer behind this alert, not just the
                        one-line summary. */}
                    <AlertLink promptId={alert.prompt_id} provider={alert.provider}>
                      {alert.message}
                    </AlertLink>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(alert.ranking?.checked_at ?? alert.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
            {alerts && alerts.length > VISIBLE_ALERTS && (
              <p className="mt-3 text-xs text-muted-foreground">
                <T k="dashboard.moreAlerts" vars={{ count: alerts.length - VISIBLE_ALERTS }} />
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </DashboardPeriodProvider>
  );
}
