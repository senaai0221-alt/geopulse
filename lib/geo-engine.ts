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
  /** Alternate names/nicknames for the SAME brand (e.g. an official
   *  product name vs. a common nickname) - any of these counts as
   *  equally "the brand" for mention/rank purposes, still via exact-
   *  text matching only (see parseResponse) - never an LLM's opinion of
   *  whether two names refer to the same thing. */
  brandAliases?: string[];
  /** Known competitor names, used to detect who else got recommended. */
  competitors: string[];
}

export type Sentiment = "positive" | "neutral" | "negative";

export interface GeoQueryResult {
  provider: LlmProvider;
  mentioned: boolean;
  /** 1-based rank within a numbered/bulleted/heading list, or null if
   *  the brand was not mentioned, or was mentioned outside of any real
   *  list structure. Purely regex/text-structure-based (see
   *  parseResponse/extractListItems) - never an LLM's own opinion of
   *  where something "would" rank, after a real incident where that
   *  produced a fabricated rank for prose with no ranking at all. */
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

// Perplexity's Agent API (see callPerplexity) runs an actual multi-step
// web-search-then-synthesize loop rather than a single completion call,
// so it routinely needs more than the 30s that was plenty for every
// provider's old single-shot chat/completions-style call - confirmed
// empirically (a real call at the old 30s timeout aborted mid-request).
// Applied to all providers uniformly since a higher ceiling is harmless
// for the faster ones, and the overall run has ample headroom under
// daily-check's own time budget (see maxDuration in
// app/api/cron/daily-check/route.ts).
const REQUEST_TIMEOUT_MS = 55_000;

// runGeoQuery fires all 6 providers in parallel for every prompt, and
// daily-check runs multiple brands concurrently on top of that (see
// BRAND_CONCURRENCY in app/api/cron/daily-check/route.ts) - so a single
// check can easily burst a dozen+ simultaneous requests at one provider.
// That's well within any real daily/monthly quota but can still trip a
// short-window rate limit, which reads identically to a real outage
// (429) unless retried. One short delayed retry absorbs a
// self-inflicted burst like that without meaningfully extending how
// long a single provider call can take.
const RATE_LIMIT_RETRY_DELAY_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** fetchWithTimeout, plus a single delayed retry on a 429 response. */
async function fetchWithRateLimitRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetchWithTimeout(url, init);
  if (res.status !== 429) return res;
  await sleep(RATE_LIMIT_RETRY_DELAY_MS + Math.random() * 500);
  return fetchWithTimeout(url, init);
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

  const res = await fetchWithRateLimitRetry("https://api.openai.com/v1/chat/completions", {
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

  const res = await fetchWithRateLimitRetry("https://api.anthropic.com/v1/messages", {
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

/**
 * Perplexity retired the Sonar Chat Completions API (`/chat/completions`,
 * the `sonar-pro` model, `choices[0].message.content` + top-level
 * `citations`) in favor of the Agent API (`/v1/agent`), effective
 * 2026-09-27 - old integrations stop working outright after that date,
 * not just get a deprecation warning. This calls the new endpoint via a
 * preset rather than pinning a raw model id: presets bundle a model +
 * search config + tool access tuned for a use case, and Perplexity
 * updates the underlying configuration over time without changing the
 * preset name - "low" (search-grounded, light multi-step research) is
 * the closest match to what `sonar-pro` gave us here, and picking a
 * preset over a pinned model avoids re-hitting this exact staleness
 * problem down the line. See docs.perplexity.ai/docs/agent-api/migrate-from-sonar.
 */
async function callPerplexity(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set");

  const res = await fetchWithRateLimitRetry("https://api.perplexity.ai/v1/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      preset: process.env.PERPLEXITY_PRESET || "low",
      input: prompt,
    }),
  });
  await throwOnError(res, "Perplexity");
  const data = await res.json();

  // Response shape: { output: [
  //   { type: "search_results", results: [{ id, url, title, ... }] },  <- the web_search tool's own results
  //   { type: "message", content: [{ type: "output_text", text, annotations: [{ url, ... }] }] },
  // ], ... }
  // The answer inline-cites sources as "[web:N]" markers referencing
  // `search_results[].results[].id`, not (as observed empirically -
  // annotations came back empty on every real call so far, despite the
  // schema supporting them) via `annotations`. Collect both so a source
  // is captured regardless of which path a given preset/model actually
  // populates.
  const output = Array.isArray(data.output) ? data.output : [];

  const messageItems = output.filter((item: { type?: string }) => item.type === "message");
  const textBlocks = messageItems.flatMap((item: { content?: unknown[] }) =>
    Array.isArray(item.content) ? item.content : []
  ) as { type?: string; text?: string; annotations?: { url?: string }[] }[];
  const outputTextBlocks = textBlocks.filter((block) => block.type === "output_text");
  const annotationUrls = outputTextBlocks.flatMap((block) => block.annotations ?? []).map((a) => a.url);

  const searchResultItems = output.filter((item: { type?: string }) => item.type === "search_results");
  const searchResultUrls = searchResultItems.flatMap((item: { results?: unknown[] }) =>
    Array.isArray(item.results) ? item.results : []
  ) as { url?: string }[];

  const citations = [...annotationUrls, ...searchResultUrls.map((r) => r.url)].filter(
    (url): url is string => Boolean(url)
  );

  return {
    text: outputTextBlocks.map((block) => block.text ?? "").join("\n"),
    citations: [...new Set(citations)],
  };
}

async function callGemini(prompt: string): Promise<ProviderResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const res = await fetchWithRateLimitRetry(
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

  const res = await fetchWithRateLimitRetry("https://api.x.ai/v1/chat/completions", {
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

  const res = await fetchWithRateLimitRetry("https://api.deepseek.com/chat/completions", {
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
 *
 * Exported (in addition to being used internally by parseResponse) so
 * anywhere else that needs to find the *same* mentions this module
 * already judged - e.g. highlighting a brand name inside a quoted
 * response snippet on the report page - reuses this exact matcher
 * rather than a second, potentially-diverging implementation. `flags`
 * defaults to "i" (single-match test); pass "gi" to find every
 * occurrence instead of just testing presence.
 */
export function nameRegex(name: string, flags = "i"): RegExp {
  const escaped = escapeRegExp(name);
  const leading = isAsciiWordChar(name[0]) ? "\\b" : "";
  const trailing = isAsciiWordChar(name[name.length - 1]) ? "\\b" : "";
  return new RegExp(`${leading}${escaped}${trailing}`, flags);
}

/**
 * Splits a response into ordered "list items" representing a ranked
 * recommendation list, trying two strategies in order of specificity:
 *
 * 1. Markdown headings used as ranked entries, e.g. "### 1. **Notion**"
 *    (common from Gemini/ChatGPT when the answer reads more like a
 *    mini-article than a plain list).
 * 2. Plain numbered ("1.", "2)") or bulleted ("-", "*", "•") lines that
 *    are NOT indented - indentation almost always means the line is a
 *    sub-detail of the item above it (e.g. "*   **Pros:** ...") rather
 *    than a new ranked entry, and must not be counted as one.
 *
 * Returns `[]` (not a rank-position source) when NEITHER structure is
 * present - there used to be a third fallback here, splitting the
 * response into paragraphs and treating "which paragraph mentions the
 * brand first" as its rank. That produced a rank_position for ANY
 * multi-paragraph prose response with no real ranking at all (a
 * comparison-style answer being the most common real-world case - see
 * the 2026-09 incident in buildResult's own comment) - "brand appears
 * in the 2nd paragraph" is not a ranking signal, it's an accident of
 * how the response happened to be worded, and treating it as one
 * produced concrete-looking-but-meaningless numbers like "#2" that then
 * drove real rank-drop alerts. A response with no genuine list
 * structure now simply has no rank position, exactly like a response
 * that never mentions the brand's rank at all (which, semantically,
 * this is) - `parseResponse`'s own `mentioned` check below has its own
 * independent whole-text match and is entirely unaffected by this.
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
  return topLevelItems;
}

// Exported (only) so the exact-match behavior can be verified directly
// against real raw-response text without needing live API keys - see
// scripts/verify-mention-matching.ts. Not otherwise used outside this
// module.
//
// `brandAliases` widens "is this the brand" beyond the single `name`
// string - added after a real incident where an LLM described the
// tracked product at #1 by its official product name only, with no
// trace of the nickname the brand was actually registered under
// anywhere in the text; the exact-match matcher (correctly, for that
// one literal string) reported "not mentioned", producing a false
// "圏外" alert for a product that was plainly right there at the top.
// Every name/alias is checked with the exact same nameRegex exact-text
// rule - this is still zero LLM judgment, just more than one string
// the operator has told us are equally "the brand".
export function parseResponse(
  rawResponse: string,
  brandName: string,
  brandAliases: string[],
  competitors: string[]
): Omit<GeoQueryResult, "provider" | "rawResponse" | "citations" | "sentiment"> & {
  /** Whichever of `brandName`/`brandAliases` actually matched - null if
   *  none did. Passed through to judgeBrandTreatment (see buildResult)
   *  so its own "is this string really in the text" framing stays
   *  accurate when an alias (not the primary name) is what matched. */
  matchedName: string | null;
} {
  const names = [brandName, ...brandAliases].map((n) => n.trim()).filter(Boolean);
  const items = extractListItems(rawResponse);

  let rankPosition: number | null = null;
  let matchedName: string | null = null;

  for (let i = 0; i < items.length; i++) {
    const hit = names.find((name) => nameRegex(name).test(items[i]));
    if (hit) {
      rankPosition = i + 1;
      matchedName = hit;
      break;
    }
  }

  if (matchedName === null) {
    matchedName = names.find((name) => nameRegex(name).test(rawResponse)) ?? null;
  }

  const mentioned = matchedName !== null;

  const competitorsMentioned = competitors.filter((competitor) =>
    nameRegex(competitor).test(rawResponse)
  );

  return { mentioned, rankPosition, competitorsMentioned, matchedName };
}

// ---------------------------------------------------------------------
// Lightweight LLM judge - sentiment only
// ---------------------------------------------------------------------

interface JudgeResult {
  sentiment: Sentiment | null;
  // Deliberately no `mentioned` field here - see buildResult for why
  // "was the brand mentioned" is decided solely by exact-text matching,
  // never by this judge call's own opinion.
  //
  // Also deliberately no rank field (removed - see buildResult and the
  // 2026-09 incident write-up in that function's own comment). This
  // judge used to also report a `recommendation_rank`, explicitly
  // instructed to return null for prose/comparison-style text rather
  // than a real numbered ranking - in practice the model didn't
  // reliably follow that instruction, and a fabricated-but-plausible
  // number (e.g. "12位") reached real users as a false rank-drop alert
  // for a response that never contained any ranking at all. `mentioned`
  // was never trusted from this judge for exactly this class of
  // failure mode; rank position now gets the same treatment.
}

const JUDGE_TIMEOUT_MS = 15_000;

/**
 * Makes one call to a cheap model (gpt-4o-mini by default) asking it to
 * read the raw response and judge its sentiment toward the brand. Only
 * ever called once buildResult has already confirmed via exact-text
 * matching that the brand name is actually present (see buildResult) -
 * this call exists purely to characterize *how* an already-confirmed
 * mention reads, not to decide *whether* the brand was mentioned (or,
 * as of this fix, *where* it ranked) at all: a model asked either of
 * those framings, with no requirement to point at literal text, will
 * readily invent an answer for something that isn't actually there.
 *
 * Fully optional: if OPENAI_API_KEY is missing, the call fails, times
 * out, or returns unparseable JSON, this returns null sentiment and the
 * pipeline never breaks because of this extra step.
 */
async function judgeBrandTreatment(rawResponse: string, brandName: string): Promise<JudgeResult> {
  const empty: JudgeResult = { sentiment: null };

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
              `{"sentiment": "positive" | "neutral" | "negative" | null}\n\n` +
              `- sentiment: ブランドが言及されている箇所の論調。\n` +
              `- 万が一、回答テキストを注意深く読んでも「${brandName}」という文字列が本当にどこにも` +
              `見当たらない場合は、sentimentを必ず null にしてください。\n\n` +
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

    return { sentiment };
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
 * lightweight LLM judge to characterize sentiment, since that reads
 * unusual formatting (markdown headings, prose-style answers) far more
 * reliably than a regex could for a genuinely subjective question like
 * tone.
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
 * end up with a hallucinated sentiment sitting alongside it either, and
 * it skips a paid API call for every prompt x provider combination
 * where the brand plainly never came up.
 *
 * `rankPosition` is `parsed.rankPosition` ONLY - it used to also accept
 * the judge's own `recommendation_rank` as a fallback when the regex
 * parser found no rank (see judgeBrandTreatment's JudgeResult comment).
 * That fallback is what let a fabricated rank reach real users: for a
 * prose/comparison-style response with no actual numbered ranking, the
 * judge would sometimes still return a plausible-looking integer
 * despite being explicitly instructed to return null in exactly that
 * case, and app/api/cron/daily-check/route.ts's anomaly detection took
 * that number completely at face value, producing an alert like
 * "順位が2位→12位に悪化しました" for a response that never contained
 * any ranking at all. Same principle as `mentioned` above, now applied
 * to rank too: a number this specific has to be grounded in the
 * text's own structure (extractListItems' regex match), never an LLM's
 * unverified opinion of where something "would" rank.
 *
 * `input.brandAliases` (see parseResponse) covers the other real
 * incident this pipeline has hit: a brand registered under a common
 * nickname whose product got described by its full official name only
 * in one particular response, with the nickname nowhere in the text.
 * The exact-match rule was working exactly as designed - the literal
 * string genuinely wasn't there - the fix is giving it more than one
 * literal string to look for, not loosening the rule itself.
 */
async function buildResult(
  provider: LlmProvider,
  response: ProviderResponse,
  input: GeoQueryInput
): Promise<GeoQueryResult> {
  const parsed = parseResponse(response.text, input.brandName, input.brandAliases ?? [], input.competitors);
  const citations = mergeCitations(response.citations, response.text);
  // Whichever name/alias actually matched (parsed.matchedName), not
  // always input.brandName - the judge's own prompt asserts that exact
  // string is present in the text, which would be a false premise if
  // only an alias (not the primary name) is what matched.
  const judge =
    parsed.mentioned && parsed.matchedName
      ? await judgeBrandTreatment(response.text, parsed.matchedName)
      : { sentiment: null };

  return {
    provider,
    rawResponse: response.text,
    citations,
    sentiment: judge.sentiment,
    rankPosition: parsed.rankPosition,
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
