/**
 * GEO Engine - queries the major LLMs (ChatGPT, Claude, Perplexity, Gemini,
 * Grok, DeepSeek) in parallel with a natural-language prompt, then parses
 * each response to determine whether a given brand is recommended and at
 * what position relative to any competitors.
 *
 * All providers are called via plain `fetch` against their REST APIs, so
 * this file has no SDK dependencies and runs fine in any Node.js
 * serverless / edge runtime.
 */

export type LlmProvider = "chatgpt" | "claude" | "perplexity" | "gemini" | "grok" | "deepseek";

export const LLM_PROVIDERS: LlmProvider[] = [
  "chatgpt",
  "claude",
  "perplexity",
  "gemini",
  "grok",
  "deepseek",
];

export interface GeoQueryInput {
  /** The natural-language question sent to each LLM, e.g.
   *  "What are the best CRM tools for small businesses?" */
  prompt: string;
  /** The brand name to search for in each response. */
  brandName: string;
  /** Known competitor names, used to detect who else got recommended. */
  competitors: string[];
}

export type Sentiment = "positive" | "neutral" | "negative";

export interface GeoQueryResult {
  provider: LlmProvider;
  mentioned: boolean;
  /** 1-based rank within a numbered/bulleted list, or null if the brand
   *  was not mentioned, or was mentioned outside of any rankable list.
   *  Judged by a lightweight LLM call when available (more robust against
   *  markdown-heading-style lists than the regex parser), falling back to
   *  the regex-based parse if the judge call fails or is unavailable. */
  rankPosition: number | null;
  /** How the brand is talked about, per the lightweight judge call. null
   *  if the brand wasn't mentioned, or the judge call was unavailable. */
  sentiment: Sentiment | null;
  competitorsMentioned: string[];
  rawResponse: string;
  /** Source URLs referenced in the response - structured citations from
   *  providers that return them (currently Perplexity), merged with any
   *  URLs found directly in the response text. */
  citations: string[];
  error?: string;
}

/** What each provider caller returns before response parsing. */
interface ProviderResponse {
  text: string;
  citations?: string[];
}

const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function throwOnError(res: Response, provider: string) {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${provider} API error ${res.status}: ${body.slice(0, 500)}`);
  }
}

// ---------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------

async function callChatGPT(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    }),
  });
  await throwOnError(res, "OpenAI");
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

async function callClaude(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  await throwOnError(res, "Anthropic");
  const data = await res.json();
  const text = (data.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("\n");
  return { text };
}

async function callPerplexity(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set");

  const res = await fetchWithTimeout("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.PERPLEXITY_MODEL || "sonar-pro",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  await throwOnError(res, "Perplexity");
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    citations: Array.isArray(data.citations) ? data.citations : [],
  };
}

async function callGemini(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );
  await throwOnError(res, "Gemini");
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return { text: parts.map((p: { text?: string }) => p.text ?? "").join("\n") };
}

async function callGrok(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY is not set");

  const res = await fetchWithTimeout("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.GROK_MODEL || "grok-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  await throwOnError(res, "Grok");
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

async function callDeepSeek(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const res = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  await throwOnError(res, "DeepSeek");
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "" };
}

const PROVIDER_CALLERS: Record<LlmProvider, (prompt: string) => Promise<ProviderResponse>> = {
  chatgpt: callChatGPT,
  claude: callClaude,
  perplexity: callPerplexity,
  gemini: callGemini,
  grok: callGrok,
  deepseek: callDeepSeek,
};

// ---------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------

/** Pulls bare http(s) URLs out of free-form response text. */
function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]}]+/g) ?? [];
  // Trim trailing sentence punctuation that regularly gets swept up
  // ("...see https://example.com." -> "https://example.com").
  return matches.map((url) => url.replace(/[.,;:!?]+$/, ""));
}

/** Combines a provider's structured citations (if any) with URLs found
 *  directly in the response text, de-duplicated. */
function mergeCitations(structured: string[] | undefined, text: string): string[] {
  return Array.from(new Set([...(structured ?? []), ...extractUrlsFromText(text)]));
}

// ---------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------

/** Escapes a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True for the ASCII "word" characters JS regex's `\b` actually
 *  understands ([A-Za-z0-9_]). */
function isAsciiWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_]/.test(ch);
}

/**
 * Builds an exact-name matcher for use against raw LLM response text.
 *
 * `\b` (word boundary) is only meaningful next to an ASCII "word"
 * character - it silently never matches next to anything else,
 * including every Japanese character. A name like "テストブランド" is
 * 100% non-ASCII, so the previous `new RegExp(\`\\b${name}\\b\`)` could
 * never match it ANYWHERE in ANY text, correct or not: `\b` requires one
 * side of the boundary to be a word char, and neither the text around a
 * Japanese name nor the name itself ever is. That regex-level "always
 * false" was silently masked because its result was OR'd with a
 * secondary LLM judge call (see buildResult) - and that judge, asked to
 * describe how a brand was "talked about" with no literal-text grounding,
 * would happily invent a verdict for a name that never appears in the
 * text at all. That combination is what let "テストブランド" get marked
 * as mentioned in a response that only ever discussed Anker.
 *
 * The fix: only anchor a `\b` on the side that actually touches an ASCII
 * word character. A pure-Japanese (or otherwise non-ASCII) name falls
 * back to a plain literal substring match instead, which is the correct
 * notion of "exact match" for scripts with no whitespace-tokenization
 * concept to begin with - and, critically, one that can actually match.
 */
function nameRegex(name: string): RegExp {
  const escaped = escapeRegExp(name);
  const leading = isAsciiWordChar(name[0]) ? "\\b" : "";
  const trailing = isAsciiWordChar(name[name.length - 1]) ? "\\b" : "";
  return new RegExp(`${leading}${escaped}${trailing}`, "i");
}

/**
 * Splits a response into ordered "list items" representing a ranked
 * recommendation list, trying three strategies in order of specificity:
 *
 * 1. Markdown headings used as ranked entries, e.g. "### 1. **Notion**"
 *    (common from Gemini/ChatGPT when the answer reads more like a
 *    mini-article than a plain list).
 * 2. Plain numbered ("1.", "2)") or bulleted ("-", "*", "•") lines that
 *    are NOT indented - indentation almost always means the line is a
 *    sub-detail of the item above it (e.g. "*   **Pros:** ...") rather
 *    than a new ranked entry, and must not be counted as one.
 * 3. Paragraph splitting, as a last resort when no list structure is
 *    detected at all.
 */
function extractListItems(text: string): string[] {
  const lines = text.split("\n");

  const headingPattern = /^\s{0,3}#{1,6}\s*\d{1,2}[.)]\s*(.*)$/;
  const headingItems: string[] = [];
  for (const line of lines) {
    const match = line.match(headingPattern);
    if (match && match[1].trim().length > 0) {
      headingItems.push(match[1].trim());
    }
  }
  if (headingItems.length > 0) return headingItems;

  // Only lines with zero leading whitespace count as top-level list
  // entries; an indented "*"/"-" is a nested sub-bullet, not a new rank.
  const topLevelPattern = /^(?:\d{1,2}[.)]|[-*•])\s+(.*)$/;
  const topLevelItems: string[] = [];
  for (const line of lines) {
    const match = line.match(topLevelPattern);
    if (match && match[1].trim().length > 0) {
      topLevelItems.push(match[1].trim());
    }
  }
  if (topLevelItems.length > 0) return topLevelItems;

  // Fallback: treat non-empty paragraphs as pseudo-ordered items.
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Exported (only) so the exact-match behavior can be verified directly
// against real raw-response text without needing live API keys - see
// scripts/verify-mention-matching.ts. Not otherwise used outside this
// module.
export function parseResponse(
  rawResponse: string,
  brandName: string,
  competitors: string[]
): Omit<GeoQueryResult, "provider" | "rawResponse" | "citations" | "sentiment"> {
  const brandPattern = nameRegex(brandName);
  const items = extractListItems(rawResponse);

  let rankPosition: number | null = null;
  for (let i = 0; i < items.length; i++) {
    if (brandPattern.test(items[i])) {
      rankPosition = i + 1;
      break;
    }
  }

  const mentioned = rankPosition !== null || brandPattern.test(rawResponse);

  const competitorsMentioned = competitors.filter((competitor) =>
    nameRegex(competitor).test(rawResponse)
  );

  return { mentioned, rankPosition, competitorsMentioned };
}

// ---------------------------------------------------------------------
// Lightweight LLM judge - sentiment + rank
// ---------------------------------------------------------------------

interface JudgeResult {
  sentiment: Sentiment | null;
  rankPosition: number | null;
  // Deliberately no `mentioned` field here - see buildResult for why
  // "was the brand mentioned" is decided solely by exact-text matching,
  // never by this judge call's own opinion.
}

const JUDGE_TIMEOUT_MS = 15_000;

/**
 * Makes one call to a cheap model (gpt-4o-mini by default) asking it to
 * read the raw response and judge how the brand was treated. Only ever
 * called once buildResult has already confirmed via exact-text matching
 * that the brand name is actually present (see buildResult) - this call
 * exists purely to characterize *how* an already-confirmed mention reads
 * (rank within a real ranking, sentiment), which the regex-based
 * extractListItems() is far more fragile at against unusual formatting
 * (markdown headings, prose-style answers, etc.). It is never used to
 * decide *whether* the brand was mentioned at all: a model asked that
 * framing, with no requirement to point at literal text, will readily
 * invent a rank/sentiment for a name that never appears in the response.
 *
 * Fully optional: if OPENAI_API_KEY is missing, the call fails, times
 * out, or returns unparseable JSON, this returns all-null/false and the
 * caller falls back to the regex-based parse's rank - the pipeline never
 * breaks because of this extra step.
 */
async function judgeBrandTreatment(rawResponse: string, brandName: string): Promise<JudgeResult> {
  const empty: JudgeResult = { sentiment: null, rankPosition: null };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !rawResponse.trim()) return empty;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_JUDGE_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content:
              `対象ブランド「${brandName}」は、以下のAIの回答テキスト中に文字列として実際に存在します` +
              `(それは呼び出し元が事前に確認済みです)。その前提のうえで、言及のされ方を分析し、` +
              `JSONのみで返答してください。他のテキストは一切含めないでください。\n\n` +
              `{"sentiment": "positive" | "neutral" | "negative" | null, "recommendation_rank": number | null}\n\n` +
              `- sentiment: ブランドが言及されている箇所の論調。\n` +
              `- recommendation_rank: 「おすすめ順」「ベスト◯選」のように、AIが明確に優劣・優先順位をつけて` +
              `複数の候補を並べたランキングの場合のみ、対象ブランドが何位か(1始まりの整数)。\n` +
              `  判定に迷ったら必ず null にしてください。特に以下は rank ではなく null:\n` +
              `  * 2つ(またはそれ以上)の候補を「Aは〜、Bは〜」と対等に比較・紹介しているだけの文章\n` +
              `    (本文中でどちらが先に登場するかは順位ではありません)\n` +
              `  * 1つの項目の中の特徴・長所・機能を箇条書きしているだけのもの\n` +
              `  * ランキングではなく単に言及・説明しているだけのもの\n` +
              `- 万が一、回答テキストを注意深く読んでも「${brandName}」という文字列が本当にどこにも` +
              `見当たらない場合は、sentiment・recommendation_rankの両方を必ず null にしてください。\n\n` +
              `回答テキスト:\n${rawResponse.slice(0, 6000)}`,
          },
        ],
      }),
    });

    if (!res.ok) return empty;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return empty;

    const parsed = JSON.parse(content);
    const sentiment: Sentiment | null = ["positive", "neutral", "negative"].includes(parsed.sentiment)
      ? parsed.sentiment
      : null;
    const rankPosition =
      Number.isInteger(parsed.recommendation_rank) && parsed.recommendation_rank > 0
        ? parsed.recommendation_rank
        : null;

    return { sentiment, rankPosition };
  } catch {
    // Network error, timeout, or malformed JSON - degrade gracefully.
    return empty;
  } finally {
    clearTimeout(timeout);
  }
}

function emptyResult(provider: LlmProvider, error: unknown): GeoQueryResult {
  return {
    provider,
    rawResponse: "",
    mentioned: false,
    rankPosition: null,
    sentiment: null,
    competitorsMentioned: [],
    citations: [],
    error: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Turns one provider's raw response into a full GeoQueryResult: runs the
 * regex-based exact-text parse first, then - only if that confirms the
 * brand name is actually, literally present in the response - asks the
 * lightweight LLM judge to characterize sentiment/rank, since it reads
 * unusual formatting (markdown headings, prose-style answers) far more
 * reliably than the regex-based list parser.
 *
 * `mentioned` is decided by the literal-text match alone, never by the
 * judge call: the judge is asked to describe *how* a brand is talked
 * about, which is a fundamentally different (and much less grounded)
 * question than *whether* its name appears in the text at all - a model
 * asked the former will readily invent an answer even when the name is
 * completely absent. Gating the judge call itself behind
 * `parsed.mentioned` (rather than calling it unconditionally and OR-ing
 * its opinion in afterward) closes that hole structurally instead of
 * just downgrading the judge's vote: an unmentioned brand can no longer
 * end up with a hallucinated sentiment/rank sitting alongside it either,
 * and it skips a paid API call for every prompt x provider combination
 * where the brand plainly never came up.
 */
async function buildResult(
  provider: LlmProvider,
  response: ProviderResponse,
  input: GeoQueryInput
): Promise<GeoQueryResult> {
  const parsed = parseResponse(response.text, input.brandName, input.competitors);
  const citations = mergeCitations(response.citations, response.text);
  const judge = parsed.mentioned
    ? await judgeBrandTreatment(response.text, input.brandName)
    : { sentiment: null, rankPosition: null };

  return {
    provider,
    rawResponse: response.text,
    citations,
    sentiment: judge.sentiment,
    rankPosition: judge.rankPosition ?? parsed.rankPosition,
    mentioned: parsed.mentioned,
    competitorsMentioned: parsed.competitorsMentioned,
  };
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Queries all LLMs in parallel for a single prompt and returns a parsed
 * result per provider. Individual provider failures (missing API key,
 * timeout, rate limit, etc.) are captured per-result rather than
 * failing the whole batch.
 */
export async function runGeoQuery(input: GeoQueryInput): Promise<GeoQueryResult[]> {
  const settled = await Promise.allSettled(
    LLM_PROVIDERS.map((provider) => PROVIDER_CALLERS[provider](input.prompt))
  );

  return Promise.all(
    settled.map((result, i) => {
      const provider = LLM_PROVIDERS[i];
      if (result.status === "fulfilled") {
        return buildResult(provider, result.value, input);
      }
      return emptyResult(provider, result.reason);
    })
  );
}

/**
 * Convenience helper to run the same prompt against a single provider.
 * Useful for retries or ad-hoc testing from the dashboard.
 */
export async function runSingleProviderQuery(
  provider: LlmProvider,
  input: GeoQueryInput
): Promise<GeoQueryResult> {
  try {
    const response = await PROVIDER_CALLERS[provider](input.prompt);
    return await buildResult(provider, response, input);
  } catch (error) {
    return emptyResult(provider, error);
  }
}
