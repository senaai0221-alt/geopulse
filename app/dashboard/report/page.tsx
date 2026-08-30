import { format } from "date-fns";
import { Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/geo-engine";
import { T } from "@/components/t";
import { PrintButton } from "../print-button";
import { UpgradePrompt } from "../upgrade-button";

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

/**
 * A4/print-optimized report - the Business-plan differentiator promised
 * on the pricing page. Deliberately plain (no charts, no client JS
 * beyond the print button) since the target output is a printed page
 * or PDF an agency hands to a client, not an interactive screen.
 * "PDF" export is the browser's native print-to-PDF via PrintButton -
 * no server-side PDF renderer/dependency needed.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: { brand?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();

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

  const [{ data: prompts }, { data: recentRankings }] = await Promise.all([
    supabase.from("prompts").select("id, text").eq("brand_id", selectedBrand.id).order("created_at", { ascending: true }),
    supabase
      .from("rankings")
      .select("prompt_id, provider, mentioned, rank_position, sentiment, competitors_mentioned, checked_at")
      .eq("brand_id", selectedBrand.id)
      .order("checked_at", { ascending: false })
      .limit(2000),
  ]);

  interface RankingRecord {
    prompt_id: string;
    provider: LlmProvider;
    mentioned: boolean;
    rank_position: number | null;
    sentiment: string | null;
    competitors_mentioned: string[];
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
  const mentionRate = latestList.length > 0 ? Math.round((mentionedCount / latestList.length) * 100) : 0;
  const ranked = latestList.filter((r) => r.rank_position !== null);
  const avgRank =
    ranked.length > 0
      ? (ranked.reduce((sum, r) => sum + (r.rank_position ?? 0), 0) / ranked.length).toFixed(1)
      : "-";

  const total = latestList.length || 1;
  const competitorNames: string[] = selectedBrand.competitors ?? [];
  const shareRows = [
    { name: selectedBrand.name, count: mentionedCount, isBrand: true },
    ...competitorNames.map((name) => ({
      name,
      count: latestList.filter((r) => r.competitors_mentioned?.includes(name)).length,
      isBrand: false,
    })),
  ];

  return (
    <div className="mx-auto max-w-[210mm] bg-background p-8 print:p-0">
      {/* @page controls the printed sheet itself; print:hidden below
          keeps the app chrome (sidebar/header from the layout) out of
          the printed output even though this page can't remove them
          from the DOM directly. */}
      <style>{`@media print { @page { size: A4; margin: 15mm; } body { background: #fff; } }`}</style>

      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          {selectedBrand.name} · <T k="report.openReport" />
        </p>
        <PrintButton />
      </div>

      <header className="mb-8 flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2 text-lg font-bold">
          <Sparkles className="h-5 w-5 text-primary" />
          Zonostick
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <T k="report.generatedAt" />: {format(new Date(), "yyyy-MM-dd HH:mm")}
        </div>
      </header>

      <h1 className="text-2xl font-bold tracking-tight">
        <T k="report.reportTitle" /> — {selectedBrand.name}
      </h1>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <T k="report.summary" />
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-md border border-border p-4">
            <p className="text-xs text-muted-foreground">
              <T k="dashboard.mentionRate" />
            </p>
            <p className="mt-1 text-2xl font-bold">{mentionRate}%</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <p className="text-xs text-muted-foreground">
              <T k="dashboard.avgRank" />
            </p>
            <p className="mt-1 text-2xl font-bold">{avgRank}</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <p className="text-xs text-muted-foreground">
              <T k="dashboard.shareOfVoice" />
            </p>
            <p className="mt-1 text-2xl font-bold">
              {Math.round(((shareRows[0]?.count ?? 0) / total) * 100)}%
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <T k="dashboard.shareOfVoice" />
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {shareRows.map((row) => (
              <tr key={row.name} className="border-b border-border">
                <td className={`py-1.5 ${row.isBrand ? "font-semibold" : ""}`}>{row.name}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {Math.round((row.count / total) * 100)}%
                </td>
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

      <footer className="mt-10 border-t border-border pt-3 text-center text-[10px] text-muted-foreground">
        <T k="report.generatedBy" /> · zonostick.com
      </footer>
    </div>
  );
}
