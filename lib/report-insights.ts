/**
 * LLM-written first draft of the monthly report's two free-text
 * sections ("this month's commentary" and "next month's recommended
 * actions") - built from the exact same aggregate numbers the report
 * page itself renders (see app/dashboard/report/page.tsx), so the
 * generated copy can never contradict the charts/tables sitting next to
 * it. Purely additive: report_notes stays a plain editable text field
 * either way (see app/dashboard/report/report-notes.tsx) - this just
 * decides what's pre-filled into it the first time a month has no
 * saved notes yet, instead of a generic "please write something here"
 * placeholder.
 *
 * Same fetch-only, no-SDK, gpt-4o-mini-by-default approach as
 * geo-engine.ts's judgeBrandTreatment - fully optional: if
 * OPENAI_API_KEY is missing or the call fails for any reason, this
 * returns null and the caller falls back to leaving the fields empty
 * (the original placeholder-driven UX), never breaking the report page.
 */
import type { LlmProvider } from "./geo-engine";

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

export interface ReportInsightsInput {
  brandName: string;
  monthLabel: string;
  kpis: { mentionRate: number; avgRank: number | null; shareOfVoice: number };
  prevKpis: { mentionRate: number; avgRank: number | null; shareOfVoice: number } | null;
  providerStats: { provider: LlmProvider; mentionRate: number; avgRank: number | null }[];
  competitorShare: { name: string; pct: number; isBrand: boolean }[];
  categoryStats: { category: string; mentionRate: number }[];
}

export interface ReportInsights {
  commentary: string;
  nextActions: string;
}

const GENERATE_TIMEOUT_MS = 20_000;

function buildPrompt(input: ReportInsightsInput): string {
  const providerLines = input.providerStats
    .map(
      (p) =>
        `- ${PROVIDER_LABELS[p.provider]}: 露出率${p.mentionRate}%、平均掲載順位${
          p.avgRank !== null ? `${p.avgRank.toFixed(1)}位` : "圏外のため算出不可"
        }`
    )
    .join("\n");

  const competitorLines =
    input.competitorShare.length > 1
      ? input.competitorShare
          .filter((c) => !c.isBrand)
          .map((c) => `- ${c.name}: ${c.pct}%`)
          .join("\n") || "(競合データなし)"
      : "(競合登録なし)";

  const categoryLines =
    input.categoryStats.length > 1
      ? input.categoryStats.map((c) => `- ${c.category}: 露出率${c.mentionRate}%`).join("\n")
      : "(カテゴリ分類なし)";

  const vsLastMonth = input.prevKpis
    ? `前月比: 露出率 ${input.kpis.mentionRate - input.prevKpis.mentionRate >= 0 ? "+" : ""}${
        input.kpis.mentionRate - input.prevKpis.mentionRate
      }pt`
    : "前月データなし(今月が初回計測)";

  return (
    `あなたはGEO(Generative Engine Optimization)専門のアナリストです。` +
    `以下は「${input.brandName}」の${input.monthLabel}分のAI検索露出データです。` +
    `このデータのみを根拠に、月次レポート用の分析テキストをJSON形式で生成してください。数値を捏造せず、与えられたデータの範囲内で客観的に記述してください。\n\n` +
    `【全体指標】\n` +
    `- AI露出率: ${input.kpis.mentionRate}%\n` +
    `- 平均掲載順位: ${input.kpis.avgRank !== null ? `${input.kpis.avgRank.toFixed(1)}位` : "圏外のため算出不可"}\n` +
    `- Share of Voice(自社シェア): ${input.kpis.shareOfVoice}%\n` +
    `- ${vsLastMonth}\n\n` +
    `【LLM別内訳】\n${providerLines}\n\n` +
    `【競合とのシェア比較】\n${competitorLines}\n\n` +
    `【カテゴリ別露出率】\n${categoryLines}\n\n` +
    `以下のJSONのみを返答してください。他のテキストは一切含めないでください。\n` +
    `{"commentary": string, "next_actions": string}\n\n` +
    `- commentary: 当月の総評・ハイライト。2〜4文程度。具体的な数値・LLM名を引用しながら、` +
    `好調な点と要注意点の両方を客観的に述べること。例:「今月はGemini(85%)およびPerplexity(66%)での認知が` +
    `高水準を維持。一方でClaudeでの順位下落が見られるため要対策。」のような文体。\n` +
    `- next_actions: 次月に向けた推奨アクション。2〜4個の具体的な施策を箇条書き(改行区切り、` +
    `各行「1. 」「2. 」のように番号を付与)で。データ上の弱点(露出率が低いLLM、競合に劣後している点など)に` +
    `対応する、実行可能な施策にすること。一般論ではなく、上記データの弱点に直接紐づく提案にすること。`
  );
}

/**
 * Calls the model and returns both texts together (they're written from
 * the same source data in one call rather than two, which is both
 * cheaper and keeps their tone/emphasis consistent with each other).
 * Returns null on any failure - missing key, timeout, non-2xx, or
 * unparseable JSON - so the caller can degrade gracefully.
 */
export async function generateReportInsights(input: ReportInsightsInput): Promise<ReportInsights | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_REPORT_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const parsed = JSON.parse(content);
    const commentary = typeof parsed.commentary === "string" ? parsed.commentary.trim() : "";
    const nextActions = typeof parsed.next_actions === "string" ? parsed.next_actions.trim() : "";
    if (!commentary && !nextActions) return null;

    return { commentary, nextActions };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
