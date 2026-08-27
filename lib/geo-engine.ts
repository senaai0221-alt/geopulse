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

export interface GeoQueryResult {
  provider: LlmProvider;
  mentioned: boolean;
  /** 1-based rank within a numbered/bulleted list, or null if the brand
   *  was not mentioned, or was mentioned outside of any rankable list. */
  rankPosition: number | null;
  competitorsMentioned: string[];
  rawResponse: string;
  /** Source URLs the provider cited, if it returned any (currently only
   *  Perplexity's API surfaces these - the others require enabling a
   *  separate web-search/grounding tool we don't turn on). */
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
// Response parsing
// ---------------------------------------------------------------------

/** Escapes a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameRegex(name: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
}

/**
 * Splits a response into ordered "list items" by looking for lines that
 * start with a numbered ("1.", "2)") or bulleted ("-", "*", "•") marker,
 * which is how LLMs typically format a ranked list of recommendations.
 * Falls back to paragraph splitting if no such list is detected.
 */
function extractListItems(text: string): string[] {
  const lines = text.split("\n");
  const numbered: string[] = [];
  const listItemPattern = /^\s*(?:\d{1,2}[.)]|[-*•])\s+(.*)$/;

  for (const line of lines) {
    const match = line.match(listItemPattern);
    if (match && match[1].trim().length > 0) {
      numbered.push(match[1].trim());
    }
  }

  if (numbered.length > 0) return numbered;

  // Fallback: treat non-empty paragraphs as pseudo-ordered items.
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseResponse(
  rawResponse: string,
  brandName: string,
  competitors: string[]
): Omit<GeoQueryResult, "provider" | "rawResponse" | "citations"> {
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
// Public API
// ---------------------------------------------------------------------

/**
 * Queries all four LLMs in parallel for a single prompt and returns a
 * parsed result per provider. Individual provider failures (missing API
 * key, timeout, rate limit, etc.) are captured per-result rather than
 * failing the whole batch.
 */
export async function runGeoQuery(input: GeoQueryInput): Promise<GeoQueryResult[]> {
  const settled = await Promise.allSettled(
    LLM_PROVIDERS.map((provider) => PROVIDER_CALLERS[provider](input.prompt))
  );

  return settled.map((result, i) => {
    const provider = LLM_PROVIDERS[i];

    if (result.status === "fulfilled") {
      const parsed = parseResponse(result.value.text, input.brandName, input.competitors);
      return {
        provider,
        rawResponse: result.value.text,
        citations: result.value.citations ?? [],
        ...parsed,
      };
    }

    return {
      provider,
      rawResponse: "",
      mentioned: false,
      rankPosition: null,
      competitorsMentioned: [],
      citations: [],
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });
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
    const parsed = parseResponse(response.text, input.brandName, input.competitors);
    return {
      provider,
      rawResponse: response.text,
      citations: response.citations ?? [],
      ...parsed,
    };
  } catch (error) {
    return {
      provider,
      rawResponse: "",
      mentioned: false,
      rankPosition: null,
      competitorsMentioned: [],
      citations: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
