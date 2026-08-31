import { format } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/geo-engine";
import { T } from "@/components/t";
import { PrintButton } from "../print-button";
import { UpgradePrompt } from "../upgrade-button";
import { MonthSelector, MonthLabel } from "./month-selector";
import { ReportNotes } from "./report-notes";
import { ReportLogo } from "./report-logo";

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

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) - end is exclusive (the first instant of the *next*
 *  month), so a plain `checked_at >= start && checked_at < end` range
 *  check on either date or timestamptz values works without off-by-one
 *  edge cases at midnight on the last day. */
function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
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

  if (profile?.plan !== "business") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">
          <T k="report.businessOnly" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <T k="report.businessOnlyDesc" />
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
  const prevMonth = previousMonthStr(month);
  const { start, end } = monthRange(month);
  const { start: prevStart, end: prevEnd } = monthRange(prevMonth);

  const [{ data: prompts }, { data: monthRankings }, { data: prevMonthRankings }, { data: notes }] = await Promise.all([
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
  const categoryStats = Array.from(promptGroups.entries()).map(([category, groupPrompts]) => {
    const ids = new Set(groupPrompts.map((p) => p.id));
    const groupRankings = rankings.filter((r) => ids.has(r.prompt_id));
    const stats = computeKpis(groupRankings, []);
    return { category, mentionRate: stats.mentionRate, promptCount: groupPrompts.length };
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

  const commentaryValue = notes?.commentary ?? "";
  const nextActionsValue = notes?.next_actions ?? "";

  return (
    <div className="mx-auto max-w-[210mm] bg-background p-8 print:bg-white print:p-0">
      {/* @page controls the printed sheet itself; print:hidden below
          keeps the app chrome (sidebar/header from the layout) and the
          on-screen-only controls (month picker, print button, notes
          save state) out of the printed output. print-color-adjust
          keeps KPI card/badge backgrounds from silently turning white
          in the printed/PDF output, which most browsers do by default. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: #fff; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .report-page { page-break-after: always; break-after: page; }
        .report-page:last-child { page-break-after: auto; break-after: auto; }
      `}</style>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">
          {selectedBrand.name} · <T k="report.openReport" />
        </p>
        <div className="flex items-center gap-2">
          <MonthSelector brandId={selectedBrand.id} month={month} />
          <PrintButton />
        </div>
      </div>

      {/* ================= PAGE 1: Executive Summary & KPIs ================= */}
      <section className="report-page">
        <header className="mb-8 flex items-center justify-between border-b border-border pb-4">
          <ReportLogo logoUrl={profile?.report_logo_url ?? null} companyName={profile?.company_name ?? null} />
          <div className="text-right text-xs text-muted-foreground">
            <T k="report.generatedAt" />: {format(new Date(), "yyyy-MM-dd HH:mm")}
          </div>
        </header>

        <h1 className="text-xl font-bold tracking-tight">
          <T k="report.monthlyReportTitle" /> (<MonthLabel month={month} />)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{selectedBrand.name}</p>

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
            brandId={selectedBrand.id}
            month={month}
            field="commentary"
            initialValue={commentaryValue}
          />
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
          <ShareOfVoiceTable rankings={rankings} brandName={selectedBrand.name} competitorNames={competitorNames} />
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.llmMatrixTitle" />
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">
                  <T k="dashboard.prompt" />
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

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.detailTable" />
          </h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 pr-2">
                  <T k="dashboard.prompt" />
                </th>
                {LLM_PROVIDERS.map((p) => (
                  <th key={p} className="py-1.5 px-1 text-center">
                    {PROVIDER_LABELS[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(prompts ?? []).map((prompt) => (
                <tr key={prompt.id} className="border-b border-border">
                  <td className="max-w-[200px] py-1.5 pr-2">{prompt.text}</td>
                  {LLM_PROVIDERS.map((provider) => {
                    const r = latestByKey.get(`${prompt.id}-${provider}`);
                    return (
                      <td key={provider} className="py-1.5 px-1 text-center tabular-nums">
                        {!r ? "—" : r.mentioned ? (r.rank_position ? `#${r.rank_position}` : "○") : "×"}
                      </td>
                    );
                  })}
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
          <div className="flex flex-col gap-2.5">
            {categoryStats.map(({ category, mentionRate, promptCount }) => (
              <div key={category} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate">
                  {category === UNCATEGORIZED ? <T k="dashboard.uncategorized" /> : category}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(mentionRate, mentionRate > 0 ? 3 : 0)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{mentionRate}%</span>
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">({promptCount})</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.snippetTitle" />
          </h2>
          {snippet && snippetPrompt ? (
            <div className="rounded-md border border-border bg-muted/30 p-4 print:border-slate-300 print:bg-slate-50">
              <p className="text-xs text-muted-foreground">
                {PROVIDER_LABELS[snippet.provider]} · {snippetPrompt.text}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {snippet.raw_response && snippet.raw_response.length > 500
                  ? `${snippet.raw_response.slice(0, 500)}…`
                  : snippet.raw_response}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              <T k="report.snippetEmpty" />
            </p>
          )}
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <T k="report.nextActionsTitle" />
          </h2>
          <ReportNotes
            brandId={selectedBrand.id}
            month={month}
            field="next_actions"
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

function ShareOfVoiceTable({
  rankings,
  brandName,
  competitorNames,
}: {
  rankings: RankingRow[];
  brandName: string;
  competitorNames: string[];
}) {
  const brandMentions = rankings.filter((r) => r.mentioned).length;
  const rows = [
    { name: brandName, count: brandMentions, isBrand: true },
    ...competitorNames.map((name) => ({
      name,
      count: rankings.filter((r) => r.competitors_mentioned?.includes(name)).length,
      isBrand: false,
    })),
  ];
  const total = rows.reduce((sum, r) => sum + r.count, 0) || 1;

  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} className="border-b border-border">
            <td className={`py-1.5 ${row.isBrand ? "font-semibold" : ""}`}>{row.name}</td>
            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
              {Math.round((row.count / total) * 100)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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

  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs text-muted-foreground">
        <T k={labelKey} />
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs">
        {delta === null ? (
          <span className="text-muted-foreground">
            <T k="report.noPreviousData" />
          </span>
        ) : (
          <span className={improved ? "text-emerald-600" : worsened ? "text-destructive" : "text-muted-foreground"}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "±"} {Math.abs(delta)}
            {unit} <T k="report.vsLastMonth" as="span" />
          </span>
        )}
      </p>
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
