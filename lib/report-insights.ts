/**
 * LLM-written first draft of the monthly report's two free-text
 * sections ("this month's commentary" and "next month's recommended
 * actions") - built from the exact same aggregate numbers the report
 * page itself renders (see app/dashboard/report/page.tsx), so the
 * generated copy can never contradict the charts/tables sitting next to
 * it. Purely additive: report_notes stays a plain editable text field
 * either way (see app/dashboard/report/report-notes.tsx,
 * next-actions-table.tsx) - this just decides what's pre-filled into it
 * the first time a month has no saved notes yet, instead of a generic
 * "please write something here" placeholder.
 *
 * `commentary` is a consulting-report-style structured text block
 * (summary, then positive/negative factors under their own headings -
 * see buildPrompt) rather than a single paragraph; `nextActions` is a
 * GFM Markdown table (see next-actions-table.tsx's parser) with one row
 * per recommended action, each carrying a purpose, a priority, and a
 * suggested owner - not just a bulleted list of sentences.
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
  /**
   * GEO施策メモ (marketing_actions - see lib/marketing-actions.ts)
   * logged within this report's month, each with a real before/after
   * mention-rate split computed from this same month's rankings (see
   * app/dashboard/report/page.tsx) - never left for the model to
   * estimate on its own. Optional/omittable: older report months (or
   * a brand that hasn't logged anything) simply have none.
   */
  marketingActions?: {
    date: string;
    category: string;
    title: string;
    mentionRateBefore: number | null;
    mentionRateAfter: number | null;
  }[];
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

  const marketingActions = input.marketingActions ?? [];
  const marketingActionLines =
    marketingActions.length > 0
      ? marketingActions
          .map((a) => {
            const beforeAfter =
              a.mentionRateBefore !== null && a.mentionRateAfter !== null
                ? ` (施策実施前の露出率${a.mentionRateBefore}% → 実施後${a.mentionRateAfter}%)`
                : "";
            return `- ${a.date} [${a.category}] ${a.title}${beforeAfter}`;
          })
          .join("\n")
      : "(当月の施策記録なし)";

  // Only asked for when there's actually something to correlate against -
  // an empty/omitted section would otherwise leave the model free to
  // invent a "施策との相関" paragraph out of nothing.
  const marketingActionInstruction =
    marketingActions.length > 0
      ? `【施策との相関 - 客観的評価】\n` +
        `「要因分析」の記述内で、上記の当月実施施策のうち施策実施前後の露出率データが提示されている` +
        `ものについて、数値に変化が見られる場合はその施策名・日付・数値を具体的に挙げて言及すること` +
        `(例:「9/5のプレスリリース配信後、露出率が32%→58%に上昇しており、施策の効果である可能性が` +
        `示唆される」)。ただし相関を示すに留め、「〜のおかげで」「〜が原因で」のような因果関係を断定` +
        `する表現は使わず、「可能性がある」「示唆される」等の慎重な表現にすること。施策前後の数値に` +
        `目立った変化が無い場合は、その施策については無理に相関へ触れず、変化が無かった旨を客観的に` +
        `記載すること。施策記録が無い場合はこの項目自体に触れないこと。\n\n`
      : "";

  return (
    `あなたはGEO(Generative Engine Optimization)専門のシビアなコンサルタントです。` +
    `以下は「${input.brandName}」の${input.monthLabel}分のAI検索露出データです。` +
    `このデータのみを根拠に、クライアント向け月次レポートの分析をJSON形式で生成してください。` +
    `KPIの数値そのものは絶対に捏造せず、与えられたデータの範囲内で厳密に記述すること` +
    `(ただし次月アクションの期限・担当は【厳守】の指示に従うこと)。\n\n` +
    `【全体指標】\n` +
    `- AI露出率: ${input.kpis.mentionRate}%\n` +
    `- 平均掲載順位: ${input.kpis.avgRank !== null ? `${input.kpis.avgRank.toFixed(1)}位` : "圏外のため算出不可"}\n` +
    `- Share of Voice(自社シェア): ${input.kpis.shareOfVoice}%\n` +
    `- ${vsLastMonth}\n\n` +
    `【LLM別内訳】\n${providerLines}\n\n` +
    `【競合とのシェア比較】\n${competitorLines}\n\n` +
    `【カテゴリ別露出率】\n${categoryLines}\n\n` +
    `【当月実施したGEO施策】\n${marketingActionLines}\n\n` +
    `以下のJSONのみを返答してください。他のテキストは一切含めないでください。\n` +
    `{"commentary": string, "next_actions_table": string}\n\n` +
    `- commentary: 必ず以下の見出しをそのまま使い、この構成・順序で出力すること(見出し文字列を変更しないこと):\n\n` +
    `【サマリー】\n` +
    `(今月のコア成果と、要対応の課題を2〜3文で簡潔に要約。数値を引用すること)\n\n` +
    `【要因分析】\n` +
    `好調要因(ポジティブ): (具体的に良かった点を1〜2文。数値・LLM名を引用すること。` +
    `例:「Gemini(85%)およびPerplexity(66%)での認知が高水準」)\n` +
    `ボトルネック(ネガティブ): (具体的な課題・弱点を1〜2文。数値・LLM名を引用すること。` +
    `例:「Claudeでの順位下落が見られ要対策」。好調要因が無い場合や課題が無い場合も、` +
    `データから読み取れる最も注意すべき点を必ず1つ挙げること)\n\n` +
    `【客観性とクリティカルな評価 - 厳守】\n` +
    `  * 一部のLLMの露出率が高くても、他のLLMの露出率が著しく低い(特に0%)場合は、` +
    `全体を「好調」「良好」等の総括的な高評価で締めくくることを絶対に禁止する。` +
    `必ず「(LLM名)が0%である重大な課題がある」のように、対象LLM名と数値を名指しした` +
    `クリティカルな指摘を含めること。全LLMが高水準でない限り、無条件の高評価は許可しない\n` +
    `  * 平均的な結果を実態以上に前向きに書き換えないこと。悪い数値は悪いと明記すること\n\n` +
    marketingActionInstruction +
    `- next_actions_table: 次月に向けた推奨アクションを、必ず以下の5列・区切り文字「|」の` +
    `Markdownテーブル形式のみで2〜4行(ヘッダー行・区切り行を除く)出力すること。テーブル以外の` +
    `文章やコメントは一切含めないこと:\n` +
    `| 具体的対策 | 目的・効果 | 期限 | 優先度 | 推奨担当 |\n` +
    `| --- | --- | --- | --- | --- |\n` +
    `| (施策) | (施策) | (期限) | (施策) | (施策) |\n\n` +
    `  各列のルール:\n` +
    `  * 「具体的対策」は上記データの弱点(露出率が低いLLM、競合に劣後している点、` +
    `露出率が低いカテゴリなど)に直接紐づく、固有名詞を含む実行可能な施策にすること` +
    `(例:「◯◯ページへの構造化データ(FAQスキーマ)の追加」「PR TIMESでのプレスリリース配信」)。\n` +
    `    【抽象表現の禁止 - 厳守】「〜を検討する」「〜の見直しを図る」「〜を強化する」だけで終わる` +
    `文、「対応する」「取り組む」のような主語・目的語のない先送り表現は一切禁止する。` +
    `何を・どこに・どう変えるのかまで名指しで書くこと\n` +
    `  * 「目的・効果」はその施策で何が改善される見込みかを一言で\n` +
    `  * 「期限」【厳守】は必ず「翌月中旬」「翌月第1週まで」「2週間以内」のような具体的な期限を` +
    `記載すること。実際のスケジュールがデータから分からない場合でも、コンサルタントとしての` +
    `提案として合理的な期限を明記すること(「未定」「適宜」等の期限を書かない表現は禁止)。` +
    `これはKPIデータの捏造ではなく、施策提案の一部として扱うこと\n` +
    `  * 「優先度」は必ず「高」「中」「低」のいずれか一文字の単語のみにすること\n` +
    `  * 「推奨担当」【厳守】は「SEO担当」のような曖昧な部署名だけでなく、` +
    `「Webマーケティームチーム」「コンテンツ制作チーム」のように、施策の性質に応じた` +
    `具体的なチーム名・担当名を1つ記載すること。実在の組織構成が不明でも、` +
    `一般的な会社組織を想定して具体的なチーム名を提案すること`
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
    const nextActions = typeof parsed.next_actions_table === "string" ? parsed.next_actions_table.trim() : "";
    if (!commentary && !nextActions) return null;

    return { commentary, nextActions };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
