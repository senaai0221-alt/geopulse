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

import { katakanaToHepburn } from "./romaji";
import {
  costFromOpenAiUsage,
  costFromAnthropicUsage,
  costFromGeminiUsage,
  costFromGrokUsage,
  costFromDeepSeekUsage,
  costFromPerplexityUsage,
} from "./provider-pricing";

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
  /** Real $ cost of this check - the provider's own call plus, when the
   *  brand was mentioned, judgeBrandTreatment's sentiment call (a
   *  second, separate OpenAI charge). null only when the provider's
   *  response didn't include enough usage data to compute a cost (a
   *  malformed/unexpected response shape) - never defaults to 0, which
   *  would silently under-count the real total instead of making the
   *  gap visible. See lib/provider-pricing.ts and lib/cost-budget.ts. */
  costUsd: number | null;
  error?: string;
}

/** What each provider caller returns before response parsing. */
interface ProviderResponse {
  text: string;
  citations?: string[];
  costUsd: number | null;
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
  return { text: data.choices?.[0]?.message?.content ?? "", costUsd: costFromOpenAiUsage(data, "gpt-4o") };
}

// Haiku, not Sonnet (2026-09) - at this app's real prompt/brand volume
// (29 active prompts across 10 brands and growing), Sonnet's per-call
// cost burned through the whole Anthropic workspace's small starter
// credit in about a week (37 calls, ~$0.11/call observed) - extrapolated
// to steady-state daily-cron volume, that's roughly $90+/month against a
// $20 monthly cap, guaranteeing the exact silent multi-day outage this
// fallback constant's own history (see the git log around 2026-09) was
// otherwise unrelated to: the credential wasn't wrong, the workspace
// just couldn't afford to keep answering. Haiku is the deliberate cost/
// accuracy tradeoff for what this task actually needs - mention/rank
// detection from a markdown-formatted answer, not open-ended reasoning
// - not a temporary stopgap; only reconsider with a real accuracy
// regression in hand, not preemptively. Matches ANTHROPIC_MODEL's
// default in .env.example - keep both in sync if this ever changes.
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

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
      model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
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
  return { text, costUsd: costFromAnthropicUsage(data) };
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
    costUsd: costFromPerplexityUsage(data),
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
  return { text: parts.map((p: { text?: string }) => p.text ?? "").join("\n"), costUsd: costFromGeminiUsage(data) };
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
  return { text: data.choices?.[0]?.message?.content ?? "", costUsd: costFromGrokUsage(data) };
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
  return { text: data.choices?.[0]?.message?.content ?? "", costUsd: costFromDeepSeekUsage(data) };
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
 * Folds full-width ("zenkaku") ASCII letters/digits/punctuation
 * (U+FF01-U+FF5E, plus the full-width space U+3000) down to their
 * ordinary half-width equivalents - Japanese-context LLM output very
 * commonly renders an alphabet brand name this way ("ＥＬＦＢＡＲ"
 * instead of "ELFBAR"), which the old byte-for-byte matcher treated as
 * a completely different string (not a case difference - these are
 * distinct Unicode code points, so the "i" flag alone never helped).
 * Every other character - every Japanese/Chinese character, every
 * symbol outside that block - passes through completely unchanged.
 *
 * One code point maps to exactly one code point, so the result is
 * always the same length with every character at the same index as
 * the input - callers that need to slice/highlight the *original*
 * text (extractMentionSnippet, evidence-snippet.tsx) can match against
 * the normalized copy and safely reuse its match indices against the
 * real, unmodified text the LLM actually returned.
 */
export function toHalfWidth(text: string): string {
  return text
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

// A family of characters different renderers use interchangeably for
// "no meaningful difference" between two parts of the same compound
// name: an ordinary space, or one of several hyphen/dash look-alikes
// (Unicode has several visually-similar code points, and which one an
// LLM's output contains is arbitrary - see the ELFBAR incident this
// generalizes). Used only as an OPTIONAL separator between two
// characters that otherwise both still have to appear, never a way to
// skip a character outright.
const OPTIONAL_SEPARATOR = "[\\s\\-\\u2010-\\u2015]?";

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
/**
 * Builds the `${leading}${core}${trailing}` fragment for exactly one
 * candidate string - factored out of nameRegex so a katakana name and
 * its mechanically-derived romaji candidate (see below) can each get
 * their own correct `\b` boundary logic (only ever meaningful next to
 * an ASCII character - a katakana candidate never gets one, its romaji
 * sibling always does) instead of one shared, wrong-for-one-of-them
 * boundary.
 */
function buildCandidatePattern(candidate: string): string {
  const leading = isAsciiWordChar(candidate[0]) ? "\\b" : "";
  const trailing = isAsciiWordChar(candidate[candidate.length - 1]) ? "\\b" : "";

  // A registered name with no internal space (e.g. "ELFBAR") is very
  // commonly rendered by an LLM with different spacing/punctuation
  // instead - as two separate title-cased words ("Elf Bar"), or with a
  // hyphen inserted ("ELF-BAR"). A real 2026-09 incident had a raw
  // response plainly list "Elf Bar BC5000" and still produced a false
  // "圏外" alert, because the old exact-contiguous pattern (still
  // case-insensitive, still Markdown-agnostic - neither of those was
  // ever the problem) simply never considered "Elf Bar" a match for
  // "ELFBAR" at all. Tolerating an optional space or hyphen/dash
  // between every character (OPTIONAL_SEPARATOR) catches both
  // renderings while staying a strict superset of the old match -
  // every character of the name must still appear, in the same order,
  // so this is additive, not a loosening of what already matched.
  // Gated to candidates with 4+ non-space characters: below that,
  // treating two short, unrelated fragments separated by a space/
  // hyphen as a "match" starts colliding with ordinary prose too often
  // to be worth it (e.g. a 2-character name matching any two of its
  // letters that happen to appear as adjacent single-letter tokens).
  const nonSpaceLength = candidate.replace(/\s/g, "").length;
  const core =
    nonSpaceLength >= 4
      ? [...candidate].map((ch) => escapeRegExp(ch)).join(OPTIONAL_SEPARATOR)
      : escapeRegExp(candidate);

  return `${leading}${core}${trailing}`;
}

export function nameRegex(name: string, flags = "i"): RegExp {
  // Fold full-width ASCII down to half-width before anything else, so
  // a name registered (or, rarely, rendered by an LLM) in either width
  // is treated identically - see toHalfWidth's own comment.
  const normalizedName = toHalfWidth(name);
  const patterns = [buildCandidatePattern(normalizedName)];

  // A katakana brand name ("ドコモ") is routinely written by an LLM in
  // plain Latin letters instead ("docomo") - a 2026-09 incident (a
  // deliberately large real-brand-name demo) found this producing
  // false "圏外" alerts for brands that were plainly mentioned, just
  // not in the script they were registered under. katakanaToHepburn is
  // a mechanical, table-driven transliteration (see lib/romaji.ts's own
  // comment) - not a fuzzy guess - so matching against its output stays
  // consistent with this function's whole exact-text philosophy: every
  // character of the ORIGINAL name still had to map to something and
  // appear in order, just expressed in a different, equally exact,
  // alphabet. This does NOT catch every real spelling (real corporate
  // romanizations routinely diverge from strict phonetic Hepburn - even
  // "ドコモ" itself mechanically romanizes to "dokomo", one letter off
  // from the real "docomo") - see lib/alert-message.ts's
  // `possibleMismatch` hint for the safety net that covers the rest.
  const romaji = katakanaToHepburn(normalizedName);
  if (romaji && romaji.length >= 2 && romaji.toLowerCase() !== normalizedName.toLowerCase()) {
    patterns.push(buildCandidatePattern(romaji));
  }

  const combined = patterns.length > 1 ? `(?:${patterns.join("|")})` : patterns[0];
  return new RegExp(combined, flags);
}

// A GFM-style Markdown table row - starts and ends with "|", with at
// least one interior "|" separating cells.
const TABLE_ROW = /^\s{0,3}\|.+\|\s*$/;
// The header-separator row every real GFM table has directly under its
// header row - only dashes/colons/pipes/spaces, e.g. "|---|:---:|--:|".
const TABLE_SEPARATOR_ROW = /^\s{0,3}\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

// A table cell that IS a stated rank marker and nothing else - "1位",
// "**1位**", "#1" - never a price/percentage/data-cap cell that merely
// starts with a digit ("2,970円", "70%", "5分" all fail this). Requires
// the 位/# marker rather than accepting a bare integer, specifically to
// avoid a coincidentally-numeric column (a 1-5 satisfaction score, a
// GB figure) in a non-ranking table being mistaken for a rank column -
// every real ranking table seen uses one of these two explicit markers.
const RANK_CELL = /^\**#?\s*\d{1,2}\s*位?\**$/;

/**
 * Strategy 1 of extractListItems (see its own comment): recognizes a
 * Markdown table with an explicit rank column and returns one item per
 * data row, in table order - e.g.
 *   | 順位 | 会社 | 特徴 |
 *   |------|------|------|
 *   | **1位** | **Rakuten Mobile** | ... |
 *   | **2位** | **ahamo（ドコモ）** | ... |
 * A real 2026-09 incident had exactly this shape for a brand's own
 * table-based ranking, with no heading/bold/bullet list anywhere else
 * in the response - none of the other three strategies recognize a
 * table row at all (they all require a line to START with "#"/"*"/
 * digit/dash, never "|"), so extractListItems returned `[]` and a
 * genuinely table-ranked brand was reported as rank-position-unknown
 * despite the table plainly stating its position.
 *
 * The rank column is found structurally, by content, not by header
 * text (a header can read "順位", "ランク", "Rank", "#", or be entirely
 * absent in a re-formatted response) - whichever column's cells ALL
 * match RANK_CELL across every data row is trusted as the rank column;
 * if no column qualifies, this table is not treated as a ranking at
 * all (returns `[]` for that table) rather than guessing. Each
 * returned item starts with that row's own rank cell verbatim ("1位",
 * "**1位**", ...) followed by every other cell - LEADING_RANK_NUMBER
 * (used by hasDuplicateRankNumbers) parses that leading cell exactly
 * like it parses a heading/bold-marker line, so a table with two "1位"
 * rows is caught by the same duplicate-rank safety net as any other
 * strategy.
 */
function extractTableItems(lines: string[]): string[] {
  const items: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!TABLE_ROW.test(lines[i]) || !TABLE_SEPARATOR_ROW.test(lines[i + 1] ?? "")) {
      i++;
      continue;
    }
    const dataRows: string[][] = [];
    let j = i + 2;
    while (j < lines.length && TABLE_ROW.test(lines[j])) {
      dataRows.push(splitTableRow(lines[j]));
      j++;
    }
    // Only the first few columns are checked - every real example seen
    // has the rank column at (or very near) the left edge, and scanning
    // every column of a wide comparison table would raise the odds of
    // a coincidental match in an unrelated numeric column.
    const columnCount = dataRows[0]?.length ?? 0;
    let rankCol = -1;
    for (let col = 0; col < Math.min(columnCount, 3); col++) {
      if (dataRows.length > 0 && dataRows.every((row) => RANK_CELL.test(row[col] ?? ""))) {
        rankCol = col;
        break;
      }
    }
    if (rankCol !== -1) {
      for (const row of dataRows) {
        const otherCells = row.filter((_, idx) => idx !== rankCol);
        items.push([row[rankCol], ...otherCells].join(" "));
      }
    }
    i = j;
  }
  return items;
}

/**
 * Splits a response into ordered "list items" representing a ranked
 * recommendation list, trying four strategies in order of specificity:
 *
 * 1. A Markdown (GFM) table with a genuine rank/order column, e.g.
 *    "| 順位 | 会社 | ... |\n|---|---|---|\n| **1位** | **Rakuten
 *    Mobile** | ... |" (2026-09 incident - see extractTableItems' own
 *    comment). Checked first - a table with an explicit rank column is
 *    the least ambiguous structural signal available, more deliberate
 *    than a heading or bold marker happening to start with a digit.
 * 2. Markdown headings used as ranked entries, e.g. "### 1. **Notion**"
 *    (common from Gemini/ChatGPT when the answer reads more like a
 *    mini-article than a plain list).
 * 3. A bold-text rank marker with no Markdown heading/list syntax at
 *    all, e.g. "**1位：日本通信（合理的シンプル290）**" (2026-09 incident -
 *    see below). Checked before the generic bullet strategy specifically
 *    so its own detail lines (see that strategy's own comment) never
 *    get a chance to be miscounted first.
 * 4. Plain numbered ("1.", "2)") or bulleted ("-", "*", "•") lines that
 *    are NOT indented - indentation almost always means the line is a
 *    sub-detail of the item above it (e.g. "*   **Pros:** ...") rather
 *    than a new ranked entry, and must not be counted as one. Also
 *    excludes a bulleted "**ラベル**：値" attribute line (e.g.
 *    "- **料金**：月額2,178円") for the same reason - see LABEL_DETAIL_LINE.
 *
 * Returns `[]` (not a rank-position source) when NONE of the three
 * structures is present - there used to be a fallback here, splitting
 * the response into paragraphs and treating "which paragraph mentions
 * the brand first" as its rank. That produced a rank_position for ANY
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
 *
 * Each returned item is the FULL block of text from its own
 * heading/bullet line up to (not including) the next one, not just
 * that one line - a real incident (also 2026-09) had a brand's #1
 * product only named in bold text on the line *after* its numbered
 * heading ("### 1. 圧倒的一番人気！...\n**Shokz OpenRun Pro 2**"), which
 * a single-line match entirely misses. Meanwhile item #5's own heading
 * text ("### 5. 【Shokz以外】...") contains the brand name as a literal
 * substring inside a NEGATION ("other than Shokz") - a single-line
 * match on item #1 finding nothing left THIS as the only match, so the
 * brand was reported at rank 5 instead of its real rank 1. Capturing
 * the full block fixes the first half (item #1 now matches, and the
 * scan stops there before ever reaching #5); parseResponse's own
 * negation guard (see hasPositiveMention) fixes the second half for
 * any case where a "○○以外" section is genuinely the only match.
 *
 * A THIRD 2026-09 incident (the one strategy 2 above and
 * LABEL_DETAIL_LINE directly address, found running a deliberately
 * large real-brand-name demo): a response with structure
 *   **1位：日本通信（...）**
 *   - **料金**：月額2,178円（税込）
 *   - **特徴**：...
 *   - **注意点**：...
 *   **2位：IIJmio（...）**
 *   ...
 * has its real rank markers ("**1位**") as bold text with no Markdown
 * heading/list syntax at all - strategy 1 (headings) never matched
 * them, so the old code fell through to strategy 3 (plain bullets),
 * which - correctly, by its own rules at the time - counted every
 * "- **ラベル**：値" detail line as a NEW top-level entry (they ARE
 * un-indented lines starting with "-"). The response also had multiple
 * independent mini-rankings ("料金重視の1〜3位", then a separate
 * "データ大量利用者向けの1〜2位"), and a brand name that only appeared,
 * completely incidentally, inside one of those unrelated detail lines
 * (a generic aside naming several carriers) - that detail line's
 * position in the miscounted list (#17) became the reported rank. See
 * parseResponse's own `hasDuplicateRankNumbers` for the last line of
 * defense this incident also motivated: even with strategies 1-3 fixed
 * for this exact shape, a genuinely ambiguous response with the SAME
 * rank number appearing more than once (multiple independent
 * mini-rankings) still can't be trusted to name one true rank - a
 * fabricated-but-plausible number is worse than admitting "掲載あり・
 * 順位不明", so that case now suppresses rank_position entirely instead
 * of guessing.
 */
function extractListItems(text: string): string[] {
  const lines = text.split("\n");

  const tableItems = extractTableItems(lines);
  if (tableItems.length > 0) return tableItems;

  const headingPattern = /^\s{0,3}#{1,6}\s*\d{1,2}[.)]\s*(.*)$/;
  const headingIndices = lines.reduce<number[]>((acc, line, i) => {
    if (headingPattern.test(line)) acc.push(i);
    return acc;
  }, []);
  if (headingIndices.length > 0) return blocksFromIndices(lines, headingIndices);

  // A rank stated as bold text alone - "**1位：...**", "**1. ...**",
  // "**1)...**", "**1】...**" - with no "#"/"-"/"*" list syntax at all.
  // Requires a digit directly after the "**" (never matches a bold
  // LABEL like "**料金**" or "**特徴**", which never starts with one).
  const boldRankPattern = /^\s{0,3}\*\*\s*\d{1,2}\s*[位.)】:：]/;
  const boldRankIndices = lines.reduce<number[]>((acc, line, i) => {
    if (boldRankPattern.test(line)) acc.push(i);
    return acc;
  }, []);
  if (boldRankIndices.length > 0) return blocksFromIndices(lines, boldRankIndices);

  // Only lines with zero leading whitespace count as top-level list
  // entries; an indented "*"/"-" is a nested sub-bullet, not a new rank.
  //
  // LABEL_DETAIL_LINE is only actually a "detail line" when it sits
  // inside a numbered item's own block ("1. **ブランドA**" followed by
  // "- **料金**：..." lines) - it must NOT be excluded just because it
  // happens to match the "- **label**：value" shape on its own, since
  // that shape is also how a perfectly ordinary standalone bullet list
  // reads (e.g. "- **一番おすすめ**：ドコモ", "- **料金を最優先**：楽天
  // モバイル" - a response with no ranking at all, just labeled
  // takeaways). Two real 2026-09 production rows were found reparsing
  // WORSE after LABEL_DETAIL_LINE started excluding unconditionally -
  // rank 1→2 and rank 3→4, both from exactly this: a document with no
  // numbered list anywhere had its only standalone bullets wiped out
  // (case 1), or had an unrelated LATER numbered list ("### 乗り換え前
  // に注意すること") retroactively swallow an EARLIER, unrelated
  // "- **label**：value" bullet section into a merged block that pulled
  // in a stray brand mention from the doc's closing paragraph (case 2).
  // `insideNumberedItem` tracks whether we are currently inside a block
  // that was actually opened by a real numbered entry ("\d{1,2}[.)]"),
  // resetting at every markdown heading (a heading always starts a new
  // section, ending any numbered list above it) - only inside such a
  // block does a "- **label**：value" line get treated as that item's
  // own detail rather than a new top-level entry.
  const topLevelPattern = /^(?:\d{1,2}[.)]|[-*•])\s+(.*)$/;
  const numberedLinePattern = /^\s{0,3}\d{1,2}[.)]\s+/;
  const headingLinePattern = /^\s{0,3}#{1,6}\s/;
  let insideNumberedItem = false;
  const topLevelIndices = lines.reduce<number[]>((acc, line, i) => {
    if (headingLinePattern.test(line)) insideNumberedItem = false;
    if (topLevelPattern.test(line)) {
      const isNumbered = numberedLinePattern.test(line);
      const isLabelDetail = LABEL_DETAIL_LINE.test(line);
      if (!(isLabelDetail && insideNumberedItem && !isNumbered)) acc.push(i);
      if (isNumbered) insideNumberedItem = true;
      else if (!isLabelDetail) insideNumberedItem = false;
    }
    return acc;
  }, []);
  return blocksFromIndices(lines, topLevelIndices);
}

// A bulleted "**ラベル**：値" attribute line - "- **料金**：月額2,178円",
// "- **特徴**：...", "* **注意点**: ..." - shaped like it COULD be
// describing an already-listed item's own attribute rather than a new
// ranked entry, even though it's an un-indented "-"/"*"/"•" line that
// would otherwise match topLevelPattern above. Matching this shape is
// necessary but not sufficient - extractListItems' own `insideNumberedItem`
// gate is what decides whether a given match is actually treated as a
// detail line (only true while we're still inside a numbered entry's
// block) versus an ordinary standalone bullet (a document with no
// numbered list at all, e.g. "- **一番おすすめ**：ドコモ", is never
// treated as detail lines - see extractListItems' own comment for two
// real 2026-09 regressions this distinction fixes).
const LABEL_DETAIL_LINE = /^(?:\d{1,2}[.)]|[-*•])\s+\*\*[^*\n]{1,20}\*\*\s*[:：]/;

/** For each line index in `starts` (the start of one ranked entry),
 *  joins every line from there up to (not including) the next index in
 *  the list - or to the end of `lines` for the last entry - into that
 *  entry's full text block. See extractListItems' own comment for why
 *  a single line isn't enough. */
function blocksFromIndices(lines: string[], starts: number[]): string[] {
  return starts
    .map((start, i) => {
      const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
      return lines.slice(start, end).join("\n").trim();
    })
    .filter((block) => block.length > 0);
}

// Matches whichever of extractListItems' own three marker forms a
// block's first line actually used - "### 1.", "**1位", "1.", "1)" -
// and captures the stated number. A plain "-"/"*"/"•" bullet with no
// digit (the common case) correctly matches nothing here.
const LEADING_RANK_NUMBER = /^\s{0,3}(?:#{1,6}\s*|\*\*\s*|[-*•]\s*)?(\d{1,2})[.)位】:：]/;

/** The rank number a block's own first line claims to be, or null if
 *  it doesn't actually state one. */
function extractLeadingRankNumber(block: string): number | null {
  const firstLine = block.split("\n", 1)[0];
  const match = firstLine.match(LEADING_RANK_NUMBER);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * True if the SAME stated rank number (e.g. "1") appears on more than
 * one of `items`' own leading lines - the strongest available signal
 * that a response contains multiple independent mini-rankings (e.g.
 * "料金重視なら1位はA、2位はB..." followed by a separate "データ量重視
 * なら1位はC、2位はD...") rather than one single ranked list. See
 * extractListItems' own comment for the real 2026-09 incident this
 * closes: with two "1位"s and two "2位"s both present, there is no
 * principled way to know which mini-ranking is "the" answer to how the
 * brand ranks overall - parseResponse treats this as "give up on a
 * rank number, not guess one" (mentioned is still decided completely
 * independently, via the existing whole-text search).
 */
function hasDuplicateRankNumbers(items: string[]): boolean {
  const seen = new Set<number>();
  for (const item of items) {
    const n = extractLeadingRankNumber(item);
    if (n === null) continue;
    if (seen.has(n)) return true;
    seen.add(n);
  }
  return false;
}

/**
 * The text up to (not including) the first blank line within `block` -
 * i.e. just its own opening paragraph. Used ONLY for the LAST item in a
 * list (see parseResponse) - never for any earlier one, which is the
 * result of a real production regression this had at first: every item
 * runs from its own marker line up to the NEXT item's marker, a bound
 * that has nothing to do with paragraph breaks, so an EARLY item's own
 * legitimate content routinely continues past a blank line (a heading
 * followed by a blank line then its actual comparison table or
 * description is completely ordinary Markdown, not a sign of drift -
 * see extractListItems' own comment for the real Notion/Evernote
 * comparison doc this broke when the cut was first applied to every
 * item, silently losing the brand's real #1 spot to a much later,
 * coincidental mention once its true match - inside a table separated
 * from its own heading by a blank line - was cut away).
 *
 * The LAST item is different in one specific way: nothing bounds it
 * except the end of the entire document (see extractListItems' own
 * comment on why that's still needed - a product name right after its
 * own heading must be captured). That absence of a real boundary is
 * exactly what let a genuinely unrelated closing paragraph get treated
 * as if it belonged to the last item. A real 2026-09 incident had a
 * numbered list of plain evaluation CRITERIA ("1. **料金プラン**: ...",
 * ..., "5. **サポート体制**: ..."), with the actual carrier names ("NTT
 * ドコモ、au、ソフトバンク") only appearing in one closing paragraph
 * after the whole list ends - item 5, being last, absorbed that
 * unrelated paragraph as if it were its own content, reporting the
 * brand at rank 5 for a document with no real per-item ranking at all.
 * Restricting the SEARCH (not the block extraction itself, which still
 * needs the full block for hasDuplicateRankNumbers/
 * extractLeadingRankNumber) to the last item's own first paragraph
 * closes this specific gap without touching the far more common case
 * of an early item's legitimate content spanning multiple paragraphs.
 */
function firstParagraph(block: string): string {
  const blankLineIndex = block.search(/\n[ \t]*\n/);
  return blankLineIndex === -1 ? block : block.slice(0, blankLineIndex);
}

// A closing bracket/punctuation-then-"以外" run, e.g. "Shokz以外", "「Shokz」
// 以外", "Shokz(ショックス)以外" - the extremely common Japanese "brands
// OTHER than X" construction. Deliberately scoped to this one specific,
// confirmed real-incident pattern (not a general negation detector,
// which would risk becoming exactly the kind of fragile heuristic this
// codebase has otherwise avoided by staying with plain exact-text
// matching) - see extractListItems' own comment for the incident.
const NEGATION_SUFFIX = /^[\s」』】》〉\])）:：、,]*以外/;

/**
 * True if `name` has at least one occurrence in `text` that ISN'T
 * immediately followed by a "以外" (excluding) suffix - i.e. a genuine
 * positive mention exists somewhere, not just a "brands other than
 * this one" reference. Used everywhere `parseResponse` used to do a
 * plain `nameRegex(name).test(...)` for brand/alias/competitor
 * matching, so "Shokz以外のおすすめ" can no longer read as a positive
 * mention of Shokz on its own.
 */
function hasPositiveMention(text: string, name: string): boolean {
  // toHalfWidth is length- and position-preserving (one code point in,
  // one code point out), so matching/slicing against this normalized
  // copy throughout stays index-consistent within this function - no
  // remapping needed, and nothing outside this function ever sees it.
  const normalizedText = toHalfWidth(text);
  for (const m of normalizedText.matchAll(nameRegex(name, "gi"))) {
    if (m.index === undefined) continue;
    const after = normalizedText.slice(m.index + m[0].length, m.index + m[0].length + 12);
    if (!NEGATION_SUFFIX.test(after)) return true;
  }
  return false;
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
): Omit<GeoQueryResult, "provider" | "rawResponse" | "citations" | "sentiment" | "costUsd"> & {
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

  // See hasDuplicateRankNumbers' own comment: a response containing
  // more than one independent mini-ranking (the same stated "1位"/"2位"
  // appearing twice) has no principled single answer for "the" rank -
  // skip the positional search entirely rather than reporting whichever
  // mini-ranking happened to come first (or, worse, an unrelated
  // detail line an earlier miscount folded into the wrong "rank").
  // `mentioned` below is completely unaffected - it's decided
  // independently by the whole-text search either way.
  if (!hasDuplicateRankNumbers(items)) {
    for (let i = 0; i < items.length; i++) {
      // The last item only is searched via firstParagraph instead of
      // its full block - see that function's own comment for why only
      // the last item (the one with no real next-item boundary) needs
      // this, and why applying it to every item was itself a real
      // regression.
      const searchText = i === items.length - 1 ? firstParagraph(items[i]) : items[i];
      const hit = names.find((name) => hasPositiveMention(searchText, name));
      if (hit) {
        rankPosition = i + 1;
        matchedName = hit;
        break;
      }
    }
  }

  if (matchedName === null) {
    matchedName = names.find((name) => hasPositiveMention(rawResponse, name)) ?? null;
  }

  const mentioned = matchedName !== null;

  const competitorsMentioned = competitors.filter((competitor) =>
    hasPositiveMention(rawResponse, competitor)
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
  /** This call's own real $ cost (2026-09) - a second, separate OpenAI
   *  charge on top of whichever provider's own call this is judging, and
   *  easy to forget entirely when adding up what a check "really costs"
   *  since it only fires for mentioned=true results. 0 (not null) when
   *  the call never ran at all (missing key/empty text) - genuinely no
   *  charge, same reasoning as emptyResult's own costUsd. */
  costUsd: number;
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
  const empty: JudgeResult = { sentiment: null, costUsd: 0 };

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
    // Computed as soon as `data` exists, even if the content parsing
    // below fails - the call was still billed either way, and losing
    // track of that would silently under-count the real total.
    const costUsd = costFromOpenAiUsage(data, "gpt-4o-mini") ?? 0;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { sentiment: null, costUsd };

    const parsed = JSON.parse(content);
    const sentiment: Sentiment | null = ["positive", "neutral", "negative"].includes(parsed.sentiment)
      ? parsed.sentiment
      : null;

    return { sentiment, costUsd };
  } catch {
    // Network error, timeout, or malformed JSON response body - degrade
    // gracefully. A malformed-JSON case technically was still billed
    // (costUsd lost here, unlike the two checked cases above that
    // capture it before anything can throw) - accepted as the rare
    // edge case this catch-all exists for in the first place.
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
    // A call that threw (network error, timeout, 4xx/5xx) was never
    // billed - genuinely 0, not "unknown," since no tokens were ever
    // generated. Distinct from a malformed-but-200 response, where
    // costFromXUsage returning null means "we don't actually know."
    costUsd: 0,
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
      : { sentiment: null, costUsd: 0 };

  return {
    provider,
    rawResponse: response.text,
    citations,
    sentiment: judge.sentiment,
    rankPosition: parsed.rankPosition,
    mentioned: parsed.mentioned,
    competitorsMentioned: parsed.competitorsMentioned,
    // The provider's own call plus the judge's own separate charge (0
    // when the judge never ran, e.g. mentioned=false) - null only
    // propagates when the PROVIDER call's own cost couldn't be computed
    // at all, since that's the dominant charge and losing track of it
    // entirely is worth surfacing as "unknown," not silently flooring to
    // just the judge's much smaller cost.
    costUsd: response.costUsd === null ? null : response.costUsd + judge.costUsd,
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
