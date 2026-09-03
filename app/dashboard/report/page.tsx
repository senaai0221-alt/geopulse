import { Download, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatJst, jstMidnight, jstMidnightFromDateString } from "@/lib/jst";
import { createClient } from "@/lib/supabase/server";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/geo-engine";
import { T } from "@/components/t";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PrintButton } from "../print-button";
import { UpgradePrompt } from "../upgrade-button";
import { MonthSelector, MonthLabel } from "./month-selector";
import { formatMonthLabel } from "@/lib/format-month-label";
import { ReportBrandSelector } from "./report-brand-selector";
import { ReportNotes } from "./report-notes";
import { ReportLogo } from "./report-logo";
import { ShareOfVoiceDonut } from "./share-of-voice-donut";
import { LlmComparisonChart } from "./llm-comparison-chart";
import { EvidenceSnippet } from "./evidence-snippet";
import { AiGenerateNotes } from "./ai-generate-notes";
import { CategoryExposureChart } from "./category-exposure-chart";
import { NextActionsTable } from "./next-actions-table";
import { Badge } from "@/components/ui/badge";
import type { ReportInsightsInput } from "@/lib/report-insights";
import { getMarketingActions, MARKETING_ACTION_CATEGORY_LABELS_JA } from "@/lib/marketing-actions";

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

const UNCATEGORIZED = "__uncategorized__";

interface RankingRow {
  prompt_id: string;
  provider: LlmProvider;
  mentioned: boolean;
  rank_position: number | null;
  sentiment: string | null;
  competitors_mentioned: string[];
  raw_response: string | null;
  checked_at: string;
}

interface KpiSet {
  total: number;
  mentionedCount: number;
  mentionRate: number; // 0-100
  avgRank: number | null;
  shareOfVoice: number; // 0-100
}

// JST (see lib/jst.ts) - "now" read via the server process's own local
// clock (UTC on Vercel, not Japan's) used to report the WRONG month for
// the first 9 hours of every JST month, silently opening the report to
// last month's data on the 1st.
function currentMonthStr(): string {
  return formatJst(new Date(), "yyyy-MM");
}

/** [start, end) - end is exclusive (the first instant of the *next*
 *  month), so a plain `checked_at >= start && checked_at < end` range
 *  check on either date or timestamptz values works without off-by-one
 *  edge cases at midnight on the last day. Boundaries are JST midnight
 *  (see lib/jst.ts), not the server process's own local midnight - on a
 *  UTC server, `new Date(y, m-1, 1)` used to construct UTC midnight,
 *  9 hours before the real start of the JST month, which silently
 *  pulled the first 9 hours of every month's data into the PREVIOUS
 *  month's report instead. */
function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: jstMidnight(y, m - 1, 1), end: jstMidnight(y, m, 1) };
}

function previousMonthStr(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function computeKpis(
  rankings: Pick<RankingRow, "mentioned" | "rank_position" | "competitors_mentioned">[],
  competitorNames: string[]
): KpiSet {
  const total = rankings.length;
  const mentionedCount = rankings.filter((r) => r.mentioned).length;
  const mentionRate = total > 0 ? Math.round((mentionedCount / total) * 100) : 0;

  const ranked = rankings.filter((r) => r.rank_position !== null);
  const avgRank =
    ranked.length > 0
      ? Math.round((ranked.reduce((sum, r) => sum + (r.rank_position ?? 0), 0) / ranked.length) * 10) / 10
      : null;

  const competitorMentions = competitorNames.reduce(
    (sum, name) => sum + rankings.filter((r) => r.competitors_mentioned?.includes(name)).length,
    0
  );
  const voiceTotal = mentionedCount + competitorMentions;
  const shareOfVoice = voiceTotal > 0 ? Math.round((mentionedCount / voiceTotal) * 100) : 0;

  return { total, mentionedCount, mentionRate, avgRank, shareOfVoice };
}

/**
 * A4/print-optimized monthly report - the Business-plan differentiator
 * promised on the pricing page. Three print pages (Executive Summary,
 * Competitive/Model Breakdown, Category & Next Actions), each a plain
 * HTML table/grid rather than a client-rendered chart - reliable
 * pagination and consistent print output matter more here than
 * interactivity. "PDF" export is the browser's native print-to-PDF via
 * PrintButton - no server-side PDF renderer/dependency needed.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: { brand?: string; month?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, report_logo_url, company_name")
    .eq("id", user.id)
    .single();

  const isBusiness = profile?.plan === "business";
  const isPro = profile?.plan === "pro";

  // No paid plan at all - neither the CSV export (Pro+Business, see
  // app/api/export/csv/route.ts) nor the A4 report itself is reachable.
  if (!isBusiness && !isPro) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">
          <T k="report.noPlanTitle" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <T k="report.noPlanDesc" />
        </p>
        <div className="mt-6 flex justify-center">
          <UpgradePrompt
            proPriceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
            businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
            currentPlan={profile?.plan}
          />
        </div>
      </div>
    );
  }

  const { data: brands } = await supabase.from("brands").select("*").order("created_at", { ascending: true });
  if (!brands || brands.length === 0) {
    // Reachable directly from the sidebar's "Report" link regardless of
    // whether any brand exists yet (e.g. right after deleting the last
    // one) - this used to `return null`, rendering a blank white page
    // with no explanation of what to do next.
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">
          <T k="report.noBrandsTitle" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <T k="report.noBrandsDesc" />
        </p>
      </div>
    );
  }
  const selectedBrand = brands.find((b) => b.id === searchParams.brand) ?? brands[0];
  const month = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : currentMonthStr();

  // Pro plan: CSV export only, not the A4 report itself (2026-09 - CSV
  // used to only be reachable from the dashboard's own button; that
  // button is gone now, replaced by this page's copy for both plans -
  // see app/dashboard/page.tsx). The AI-written commentary, charts, and
  // print-optimized layout below stay the Business-plan differentiator
  // promised on the pricing/landing pages (landing.faqA2,
  // report.businessOnlyDesc) - opening the rest of this page to Pro
  // would silently hand out what Business pays extra for, so nothing
  // past the brand switcher and CSV link is even fetched for Pro.
  //
  // Deliberately two separate Cards, not one section with the CSV link
  // floating in a header above a big upgrade block - an earlier version
  // did exactly that, and a solid-border "available now" card sitting
  // directly above a much bigger, more visually dominant upgrade card
  // read as "you need to upgrade to use ANY of this, including CSV" -
  // the CSV button was small and easy to miss while the upgrade card
  // filled most of the screen. Each card now names exactly what it
  // covers (a solid border + an explicit "included in your current
  // plan" line for CSV; a dashed border + a lock icon + a title naming
  // the A4/PDF report specifically, not a bare "this feature", for the
  // one that actually needs Business), so neither can be read as
  // gating the other.
  if (isPro) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="mb-6">
          <ReportBrandSelector brands={brands} selectedBrandId={selectedBrand.id} month={month} />
        </div>

        <Card>
          <CardHeader className="flex-row items-center gap-2.5 space-y-0">
            <Download className="h-4 w-4 text-primary" />
            <CardTitle>
              <T k="report.csvExportTitle" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CardDescription className="text-sm">
              <T k="report.csvExportDesc" />
            </CardDescription>
            <a
              href={`/api/export/csv?brand=${selectedBrand.id}`}
              className={cn(buttonVariants({ size: "sm" }), "w-fit gap-1.5")}
            >
              <Download className="h-3.5 w-3.5" />
              <T k="dashboard.downloadCsv" />
            </a>
          </CardContent>
        </Card>

        <Card className="mt-6 border-dashed">
          <CardHeader className="flex-row items-center gap-2.5 space-y-0">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <CardTitle>
              <T k="report.a4BusinessOnly" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CardDescription className="text-sm">
              <T k="report.businessOnlyDesc" />
            </CardDescription>
            <UpgradePrompt
              proPriceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
              businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
              currentPlan={profile?.plan}
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  const prevMonth = previousMonthStr(month);
  const { start, end } = monthRange(month);
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth);

  const [{ data: prompts }, { data: monthRankings }, { data: prevMonthRankings }, { data: notes }, monthActions] =
    await Promise.all([
      supabase
        .from("prompts")
        .select("id, text, category")
        .eq("brand_id", selectedBrand.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("rankings")
        .select("prompt_id, provider, mentioned, rank_position, sentiment, competitors_mentioned, raw_response, checked_at")
        .eq("brand_id", selectedBrand.id)
        .gte("checked_at", start.toISOString())
        .lt("checked_at", end.toISOString())
        .order("checked_at", { ascending: false }),
      supabase
        .from("rankings")
        .select("mentioned, rank_position, competitors_mentioned")
        .eq("brand_id", selectedBrand.id)
        .gte("checked_at", prevStart.toISOString())
        .lt("checked_at", prevEnd.toISOString()),
      supabase.from("report_notes").select("commentary, next_actions").eq("brand_id", selectedBrand.id).eq("month", month).maybeSingle(),
      getMarketingActions(supabase, selectedBrand.id, { start, end }),
    ]);

  const rankings = (monthRankings ?? []) as RankingRow[];
  const competitorNames: string[] = selectedBrand.competitors ?? [];

  const kpis = computeKpis(rankings, competitorNames);
  const prevKpis =
    prevMonthRankings && prevMonthRankings.length > 0 ? computeKpis(prevMonthRankings, competitorNames) : null;

  // Latest-within-the-month snapshot per (prompt, provider) - used for
  // the page 2 detail matrix, where a single current status per cell
  // reads better than an averaged number.
  const latestByKey = new Map<string, RankingRow>();
  for (const r of rankings) {
    const key = `${r.prompt_id}-${r.provider}`;
    if (!latestByKey.has(key)) latestByKey.set(key, r);
  }

  const providerStats = LLM_PROVIDERS.map((provider) => {
    const providerRankings = rankings.filter((r) => r.provider === provider);
    const stats = computeKpis(providerRankings, []);
    return { provider, mentionRate: stats.mentionRate, avgRank: stats.avgRank };
  });

  // Feeds both the page-2 Share of Voice donut and (further below) the
  // AI insights prompt - one shared computation so the chart and the
  // AI-written commentary can never disagree with each other.
  const shareOfVoiceRows = [
    { name: selectedBrand.name, count: kpis.mentionedCount, isBrand: true },
    ...competitorNames.map((name) => ({
      name,
      count: rankings.filter((r) => r.competitors_mentioned?.includes(name)).length,
      isBrand: false,
    })),
  ];
  const shareOfVoiceTotal = shareOfVoiceRows.reduce((sum, r) => sum + r.count, 0);

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

  // One color per real category, assigned by first-appearance order
  // (never sorted) so a category keeps its color across months as
  // prompts get added/removed - same convention as the app's other
  // categorical palettes (competitors, LLM providers). Reused for both
  // the detail-table tag badges below and the category exposure chart
  // on page 3, so a category reads as one consistent visual identity
  // across the whole report rather than being re-colored per section.
  // "Uncategorized" deliberately sits outside the rotation - it's a
  // fallback bucket, not a real tag, so it always renders as neutral
  // gray instead of visually competing with real category colors.
  const CATEGORY_COLORS = ["#f59e0b", "#0ea5e9", "#a78bfa", "#fb7185", "#14b8a6", "#f43f5e"];
  const UNCATEGORIZED_COLOR = "#94a3b8";
  const categoryColorMap = new Map<string, string>();
  let categoryColorIndex = 0;
  for (const key of promptGroups.keys()) {
    if (key === UNCATEGORIZED) continue;
    categoryColorMap.set(key, CATEGORY_COLORS[categoryColorIndex % CATEGORY_COLORS.length]);
    categoryColorIndex++;
  }
  function colorForCategory(category: string): string {
    return category === UNCATEGORIZED ? UNCATEGORIZED_COLOR : categoryColorMap.get(category) ?? UNCATEGORIZED_COLOR;
  }

  const categoryStats = Array.from(promptGroups.entries()).map(([category, groupPrompts]) => {
    const ids = new Set(groupPrompts.map((p) => p.id));
    const groupRankings = rankings.filter((r) => ids.has(r.prompt_id));
    const stats = computeKpis(groupRankings, []);
    return {
      category,
      isUncategorized: category === UNCATEGORIZED,
      mentionRate: stats.mentionRate,
      promptCount: groupPrompts.length,
      color: colorForCategory(category),
    };
  });

  // Best evidence snippet: a mentioned response with actual text to
  // quote, preferring positive sentiment and the best (lowest) rank
  // position among the month's results.
  const snippetCandidates = rankings.filter((r) => r.mentioned && r.raw_response && r.raw_response.trim());
  const snippet = [...snippetCandidates].sort((a, b) => {
    const aPositive = a.sentiment === "positive" ? 0 : 1;
    const bPositive = b.sentiment === "positive" ? 0 : 1;
    if (aPositive !== bPositive) return aPositive - bPositive;
    const aRank = a.rank_position ?? 99;
    const bRank = b.rank_position ?? 99;
    return aRank - bRank;
  })[0];
  const snippetPrompt = snippet ? (prompts ?? []).find((p) => p.id === snippet.prompt_id) : null;

  // For each logged GEO施策 this month, a real before/after exposure-
  // rate split computed from this month's own rankings - never left for
  // the AI to guess at. checked_at is compared against the action's own
  // JST midnight (see lib/jst.ts), so a check that ran later the same
  // day the action was taken counts as "after". null/null (rather than
  // 0/0) when either side has no data at all, so lib/report-insights.ts
  // can tell "no measurable change" apart from "not enough data to say"
  // and skip the claim entirely rather than asserting a number computed
  // from zero checks.
  const marketingActionsForInsights = monthActions.map((a) => {
    const actionMidnight = jstMidnightFromDateString(a.action_date);
    const beforeRankings = rankings.filter((r) => new Date(r.checked_at) < actionMidnight);
    const afterRankings = rankings.filter((r) => new Date(r.checked_at) >= actionMidnight);
    const rateOf = (rows: typeof rankings) =>
      rows.length > 0 ? Math.round((rows.filter((r) => r.mentioned).length / rows.length) * 100) : null;

    return {
      date: formatJst(actionMidnight, "M/d"),
      category: MARKETING_ACTION_CATEGORY_LABELS_JA[a.category],
      title: a.title,
      mentionRateBefore: rateOf(beforeRankings),
      mentionRateAfter: rateOf(afterRankings),
    };
  });

  const commentaryValue = notes?.commentary ?? "";
  const nextActionsValue = notes?.next_actions ?? "";

  // Feeds the "AI first draft" generator (see ai-generate-notes.tsx) -
  // exactly the aggregate numbers already computed above for the
  // charts/tables, so the generated commentary is guaranteed to match
  // what the reader sees next to it rather than a second, independently
  // (re-)computed view of the same month.
  const insightsData: ReportInsightsInput = {
    brandName: selectedBrand.name,
    monthLabel: formatMonthLabel(month, "ja"),
    kpis: { mentionRate: kpis.mentionRate, avgRank: kpis.avgRank, shareOfVoice: kpis.shareOfVoice },
    prevKpis: prevKpis
      ? { mentionRate: prevKpis.mentionRate, avgRank: prevKpis.avgRank, shareOfVoice: prevKpis.shareOfVoice }
      : null,
    providerStats,
    competitorShare: shareOfVoiceRows.map((r) => ({
      name: r.name,
      pct: shareOfVoiceTotal > 0 ? Math.round((r.count / shareOfVoiceTotal) * 100) : 0,
      isBrand: r.isBrand,
    })),
    categoryStats: categoryStats.map((c) => ({
      category: c.category === UNCATEGORIZED ? "未分類" : c.category,
      mentionRate: c.mentionRate,
    })),
    marketingActions: marketingActionsForInsights,
  };
  const hasNotesRow = !!notes;
  const hasReportData = rankings.length > 0;

  return (
    <div className="mx-auto max-w-[210mm] bg-background p-8 print:bg-white print:p-0">
      {/* @page controls the printed sheet itself; print:hidden below
          keeps the app chrome (sidebar/header from the layout) and the
          on-screen-only controls (month picker, print button, notes
          save state) out of the printed output. print-color-adjust
          keeps KPI card/badge backgrounds from silently turning white
          in the printed/PDF output, which most browsers do by default. */}
      {/* dangerouslySetInnerHTML, not a plain template-literal child - a
          <style> tag's content is a "raw text" element the browser never
          HTML-entity-decodes, but a plain JSX string child still gets
          entity-escaped by React's server renderer (the apostrophe/angle
          brackets in the comment below became &#x27;/&lt;/&gt; in the
          server HTML while the client's fresh re-render kept them literal),
          which read as a real content mismatch and threw a hydration
          error. __html is set verbatim on both server and client, so
          there's nothing left to disagree about. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: #fff; }
          /* Covers badge/pill backgrounds, the brand-name highlight
             (evidence-snippet.tsx's <mark>), and category bar fills -
             browsers drop background-color by default when printing
             unless this is forced on every element that might set one. */
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* SVG fill/stroke attributes (every recharts bar/slice/line
             below) print at full color regardless of the rule above -
             print-color-adjust only ever governs CSS background-color/
             box-shadow, never vector fill/stroke - so the charts need
             no special handling of their own to survive printing intact. */
          .recharts-tooltip-wrapper { display: none !important; }
        }
        .report-page { page-break-after: always; break-after: page; }
        .report-page:last-child { page-break-after: auto; break-after: auto; }
      `,
        }}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ReportBrandSelector brands={brands} selectedBrandId={selectedBrand.id} month={month} />
        <div className="flex items-center gap-2">
          <MonthSelector brandId={selectedBrand.id} month={month} />
          {/* The dashboard's own CSV button (app/dashboard/page.tsx) was
              removed (2026-09) in favor of this one place - export lives
              on the report page alongside PDF (PrintButton), not
              scattered across both. This is the Business-plan copy of
              the same link the isPro branch above also renders (its own
              stripped-down page, without the rest of this one). */}
          <a
            href={`/api/export/csv?brand=${selectedBrand.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <Download className="h-3.5 w-3.5" />
            <T k="dashboard.downloadCsv" />
          </a>
          <PrintButton />
        </div>
      </div>

      {/* ================= PAGE 1: Executive Summary & KPIs ================= */}
      <section className="report-page">
        <header className="mb-8 flex items-center justify-between border-b border-border pb-4">
          <ReportLogo logoUrl={profile?.report_logo_url ?? null} companyName={profile?.company_name ?? null} />
          <div className="text-right text-xs text-muted-foreground">
            <T k="report.generatedAt" />: {formatJst(new Date(), "yyyy-MM-dd HH:mm")}
          </div>
        </header>

        {/* The brand name is the one thing a reader must register in the
            first second of looking at this document - who is this
            report even about - so it carries the biggest, boldest type
            on the page; the report's own title/month become a small
            eyebrow label above it instead of competing for the same
            attention. The accent bar underneath is the "badge" framing
            without boxing the name in, which would fight print
            pagination at long brand names. break-inside-avoid keeps the
            whole block (label + name + bar) from splitting across a
            page break in print. */}
        <div className="break-inside-avoid">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <T k="report.monthlyReportTitle" /> · <MonthLabel month={month} />
          </p>
          <h1 className="mt-1 break-words text-4xl font-extrabold leading-tight tracking-tight text-foreground print:text-4xl">
            {selectedBrand.name}
          </h1>
          <div className="mt-2 h-1.5 w-20 rounded-full bg-primary print:bg-primary" />
          {/* A reader handed this report cold (a client's own
              stakeholder, not the agency that generated it) may never
              have heard the term "GEO" - one small, plain-language
              definition up front costs nothing and heads off that
              question before it's asked. */}
          <p className="mt-3 text-xs text-muted-foreground">
            <T k="report.geoExplainer" />
          </p>
        </div>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.execSummaryTitle" />
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <KpiCard labelKey="dashboard.mentionRate" value={`${kpis.mentionRate}%`} delta={prevKpis ? kpis.mentionRate - prevKpis.mentionRate : null} unit="pt" />
            <KpiCard
              labelKey="dashboard.avgRank"
              value={kpis.avgRank !== null ? kpis.avgRank.toFixed(1) : "-"}
              delta={
                prevKpis && kpis.avgRank !== null && prevKpis.avgRank !== null
                  ? Math.round((kpis.avgRank - prevKpis.avgRank) * 10) / 10
                  : null
              }
              // A lower rank number is better, so an improvement is a
              // *negative* delta here - the opposite of every other KPI.
              // No unit suffix, matching how the raw value itself is
              // shown bare everywhere else in the app (dashboard,
              // llm-comparison-chart) - "位" only appears inside the
              // (deliberately JA-only) AI-generation prompt text in
              // lib/report-insights.ts, never in this locale-aware UI.
              lowerIsBetter
              unit=""
            />
            <KpiCard labelKey="dashboard.shareOfVoice" value={`${kpis.shareOfVoice}%`} delta={prevKpis ? kpis.shareOfVoice - prevKpis.shareOfVoice : null} unit="pt" />
          </div>
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.commentaryTitle" />
          </h2>
          <ReportNotes
            // ReportNotes seeds its editable local state from
            // `initialValue` once, on mount, and (correctly, for a
            // plain manual edit) never re-syncs to a changed prop
            // afterward - but the AI-generate flow writes fresh text
            // server-side and refreshes this page without this
            // component ever unmounting, so without a key forcing
            // React to treat it as a new instance, the textarea would
            // keep showing whatever it had before generation ran.
            // Keyed on this field's OWN current server value (not a
            // shared per-row timestamp) so it remounts only when *this*
            // field's stored content actually changed - saving the
            // sibling next_actions box, or typing here without blurring
            // yet, must never interrupt/reset this one.
            key={commentaryValue}
            brandId={selectedBrand.id}
            month={month}
            field="commentary"
            initialValue={commentaryValue}
          />
          {/* Rendered once for the whole page - one generation call
              writes both this field and next_actions on page 3
              together. See ai-generate-notes.tsx. */}
          <div className="mt-2">
            <AiGenerateNotes
              brandId={selectedBrand.id}
              month={month}
              insightsData={insightsData}
              hasNotesRow={hasNotesRow}
              hasData={hasReportData}
            />
          </div>
        </section>

        {/* Moved up from what used to be page 2's tail: the reader
            should see exactly which prompts this report is even
            measuring right after the topline numbers and the written
            take on them, not several pages of charts later. */}
        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.detailTable" />
          </h2>
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                {/* Fixed shares of the row (rather than a max-w-px cap)
                    so the prompt column scales with however many
                    provider columns sit beside it, and stays wide
                    enough for a full-length Japanese prompt to wrap
                    across 2-3 short lines instead of many narrow ones. */}
                <th className="w-[28%] py-1.5 pr-2">
                  <T k="dashboard.prompt" />
                </th>
                <th className="w-[14%] py-1.5 pr-2">
                  <T k="report.detailTableTag" />
                </th>
                {LLM_PROVIDERS.map((p) => (
                  <th key={p} className="py-1.5 px-1 text-center">
                    {PROVIDER_LABELS[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(prompts ?? []).map((prompt) => {
                const category = prompt.category?.trim() || null;
                return (
                  <tr key={prompt.id} className="border-b border-border">
                    <td className="break-words py-2 pr-2 leading-relaxed">{prompt.text}</td>
                    <td className="py-2 pr-2">
                      {category ? (
                        <Badge
                          variant="outline"
                          className="whitespace-nowrap border-transparent font-medium"
                          style={{
                            backgroundColor: `${colorForCategory(category)}1a`,
                            color: colorForCategory(category),
                          }}
                        >
                          {category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {LLM_PROVIDERS.map((provider) => {
                      const r = latestByKey.get(`${prompt.id}-${provider}`);
                      return (
                        <td key={provider} className="py-1.5 px-1 text-center tabular-nums">
                          {!r ? "—" : r.mentioned ? (r.rank_position ? `#${r.rank_position}` : "○") : "×"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <PageFooter n={1} />
      </section>

      {/* ================= PAGE 2: Competitive Comparison & LLM Breakdown ================= */}
      <section className="report-page">
        <h1 className="mb-6 text-lg font-bold tracking-tight">
          <T k="report.page2Title" />
        </h1>

        <section className="break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="dashboard.shareOfVoice" />
          </h2>
          <ShareOfVoiceDonut rows={shareOfVoiceRows} total={shareOfVoiceTotal} />
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.llmMatrixTitle" />
          </h2>
          <LlmComparisonChart stats={providerStats} />
        </section>

        <section className="mt-8 break-inside-avoid">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">
                  <T k="report.llmMatrixModel" />
                </th>
                <th className="py-1.5 px-2 text-right font-medium">
                  <T k="report.llmMatrixExposure" />
                </th>
                <th className="py-1.5 px-2 text-right font-medium">
                  <T k="report.llmMatrixAvgRank" />
                </th>
              </tr>
            </thead>
            <tbody>
              {providerStats.map((p) => (
                <tr key={p.provider} className="border-b border-border">
                  <td className="py-1.5 pr-2 font-medium">{PROVIDER_LABELS[p.provider]}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{p.mentionRate}%</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{p.avgRank !== null ? p.avgRank.toFixed(1) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <PageFooter n={2} />
      </section>

      {/* ================= PAGE 3: Category Performance, Evidence & Next Actions ================= */}
      <section className="report-page">
        <h1 className="mb-6 text-lg font-bold tracking-tight">
          <T k="report.page3Title" />
        </h1>

        <section className="break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.categoryBreakdownTitle" />
          </h2>
          <CategoryExposureChart stats={categoryStats} />
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.snippetTitle" />
          </h2>
          {snippet && snippetPrompt ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">
                {PROVIDER_LABELS[snippet.provider]} · {snippetPrompt.text}
              </p>
              <EvidenceSnippet
                text={
                  snippet.raw_response && snippet.raw_response.length > 500
                    ? `${snippet.raw_response.slice(0, 500)}…`
                    : snippet.raw_response ?? ""
                }
                brandName={selectedBrand.name}
                provider={snippet.provider}
                rank={snippet.rank_position}
                category={snippetPrompt.category}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              <T k="report.snippetEmpty" />
            </p>
          )}
        </section>

        {/* What the AI commentary's own "施策との相関" remarks (see
            lib/report-insights.ts) are actually pointing at - the raw
            before/after numbers sit right here so a reader can check
            the claim against real data instead of taking the generated
            text on faith. */}
        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="marketingActions.reportSectionTitle" />
          </h2>
          {monthActions.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {monthActions.map((a, i) => {
                const insight = marketingActionsForInsights[i];
                return (
                  <li key={a.id} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 tabular-nums text-muted-foreground">{a.action_date}</span>
                    <Badge variant="outline" className="mt-0 shrink-0 whitespace-nowrap">
                      <T k={`marketingActions.category.${a.category}`} />
                    </Badge>
                    <span className="min-w-0 flex-1">
                      {a.title}
                      {insight && insight.mentionRateBefore !== null && insight.mentionRateAfter !== null && (
                        <span className="ml-2 text-muted-foreground">
                          <T
                            k="marketingActions.reportBeforeAfter"
                            vars={{ before: insight.mentionRateBefore, after: insight.mentionRateAfter }}
                          />
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              <T k="marketingActions.reportSectionEmpty" />
            </p>
          )}
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.nextActionsTitle" />
          </h2>
          <NextActionsTable
            // Same reasoning as the commentary ReportNotes above - keyed
            // on its own current server value so a fresh AI-generated
            // table actually replaces whatever was showing before,
            // without remounting on an unrelated page refresh.
            key={nextActionsValue}
            brandId={selectedBrand.id}
            month={month}
            initialValue={nextActionsValue}
          />
        </section>

        <footer className="mt-10 border-t border-border pt-3 text-center text-[10px] text-muted-foreground">
          <T k="report.generatedBy" /> · zonostick.com
        </footer>
        <PageFooter n={3} />
      </section>
    </div>
  );
}


/** One KPI tile with a month-over-month delta badge. Plain server-
 *  rendered markup (no client chart) - print output needs to be exact
 *  and predictable, not animated. */
function KpiCard({
  labelKey,
  value,
  delta,
  unit,
  lowerIsBetter,
}: {
  labelKey: string;
  value: string;
  delta: number | null;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  const improved = delta !== null && (lowerIsBetter ? delta < 0 : delta > 0);
  const worsened = delta !== null && (lowerIsBetter ? delta > 0 : delta < 0);
  const sign = delta !== null && delta > 0 ? "+" : delta !== null && delta < 0 ? "-" : "±";

  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs text-muted-foreground">
        <T k={labelKey} />
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {delta === null ? (
          <span className="text-xs text-muted-foreground">
            - (<T k="report.noPreviousData" as="span" />)
          </span>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              <T k="report.vsLastMonth" />
            </span>
            <Badge
              variant={improved ? "success" : worsened ? "destructive" : "secondary"}
              className="tabular-nums"
            >
              {sign}
              {Math.abs(delta)}
              {unit}
            </Badge>
          </>
        )}
      </div>
    </div>
  );
}

function PageFooter({ n }: { n: number }) {
  return (
    <p className="mt-6 hidden text-center text-[10px] text-muted-foreground print:block">
      <T k="report.pageLabel" vars={{ n }} />
    </p>
  );
}
