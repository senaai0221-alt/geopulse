/**
 * Computes the real US-dollar cost of one LLM provider call from its own
 * raw API response, so every ranking check can carry an honest
 * `cost_usd` instead of nobody finding out until a provider's own
 * console shows a drained balance (see the 2026-09 incident:
 * ANTHROPIC_API_KEY silently expired, and the workspace's whole small
 * starter credit had already been burned through by Sonnet's real
 * per-call cost weeks before anyone noticed - see lib/geo-engine.ts's
 * callClaude for the full writeup). This module is the other half of
 * that fix: recording what each call actually cost, not just picking a
 * cheaper model once and hoping.
 *
 * Two different sources of truth, by provider:
 *
 * 1. Grok and Perplexity return their OWN self-reported dollar cost
 *    directly in the response (`usage.cost_in_usd_ticks` and
 *    `usage.cost.total_cost` respectively) - the most trustworthy
 *    number available, since it comes from the same system that
 *    actually bills the account and never goes stale when a provider
 *    changes pricing or silently reroutes a request to a different
 *    model (confirmed empirically 2026-09: requesting "grok-4" was
 *    actually served by "grok-4.3" - the self-reported cost was still
 *    exactly right regardless).
 * 2. ChatGPT, Claude, Gemini, and DeepSeek only return token counts, not
 *    a dollar figure, so each needs a manually-curated per-token rate
 *    below. These WILL drift out of date as providers change pricing -
 *    that is a known, accepted limitation, not an oversight. The
 *    monthly-budget check this feeds (lib/cost-budget.ts) is a coarse
 *    early-warning system, not a penny-accurate invoice; a rate a few
 *    percent stale still catches a real order-of-magnitude problem (a
 *    model silently switched to something 10x pricier) long before the
 *    old "check the console once a quarter" approach ever would.
 *    **Whoever updates a model id in geo-engine.ts should update the
 *    matching rate here in the same change - grep this file for the
 *    model name being replaced.**
 */

// $ per 1,000,000 tokens. Verified against each provider's own pricing
// page on 2026-09-04 - see the date on this comment before trusting
// these blindly months later.
const RATE_PER_MILLION_TOKENS = {
  // https://openai.com/index/gpt-5-6/ + real-call pricing search
  // (2026-09) - GPT-5.6 Luna, the cost-optimized tier of the current
  // GPT-5.6 generation (see geo-engine.ts's DEFAULT_OPENAI_MODEL for
  // why this replaced gpt-4o's legacy pricing).
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  // gpt-4o-mini, used only by judgeBrandTreatment's sentiment call, not
  // a daily-check provider itself - kept in the same table since it's
  // the same OpenAI account/budget either way. Deliberately NOT swept
  // to a GPT-5.6 tier alongside the main chat model above - "mini" is
  // still on OpenAI's current pricing page (unlike gpt-4o's grandfathered
  // full-size listing), so it doesn't carry the same staleness risk;
  // revisit only if that changes.
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // https://claude.com/pricing - Claude Haiku 4.5.
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  // https://ai.google.dev/gemini-api/docs/pricing - Gemini 3.8 Flash,
  // "through December 31, 2026" introductory rate (identical to 3.6
  // Flash's own rate - a pure generation bump, not a price change);
  // rises to $1.50/$7.50 on 2027-01-01 - this table needs a manual
  // bump then.
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  // https://api-docs.deepseek.com/quick_start/pricing - deepseek-v4-flash
  // (what "deepseek-chat" is actually served by as of the verification
  // date), OFF-PEAK cache-miss rate. Peak hours (01:00-04:00 and
  // 06:00-10:00 UTC) double both figures - not modeled here (this app's
  // daily cron runs at 07:23 JST = 22:23 UTC, outside DeepSeek's peak
  // window, so off-peak is the correct rate for real traffic; a manual
  // "今すぐチェック" at an arbitrary hour could occasionally land in
  // DeepSeek's peak window and be modestly under-counted here - an
  // accepted gap, not worth the complexity of a UTC-hour lookup for the
  // cheapest of the six providers by a wide margin either way).
  "deepseek-v4-flash": { input: 0.22, output: 0.66 },
} as const;

type RateKey = keyof typeof RATE_PER_MILLION_TOKENS;

function tokenCost(rateKey: RateKey, inputTokens: number, outputTokens: number): number {
  const rate = RATE_PER_MILLION_TOKENS[rateKey];
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

/** `data` is the parsed JSON body of an OpenAI-shaped chat/completions
 *  response (`usage.prompt_tokens`/`usage.completion_tokens`) - used for
 *  both callChatGPT's own result and judgeBrandTreatment's sentiment
 *  call, which is why the rate key is a parameter rather than always
 *  "gpt-4o". */
export function costFromOpenAiUsage(
  data: { usage?: { prompt_tokens?: number; completion_tokens?: number } },
  rateKey: "gpt-5.6-luna" | "gpt-4o-mini"
): number | null {
  const usage = data.usage;
  if (!usage || typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") return null;
  return tokenCost(rateKey, usage.prompt_tokens, usage.completion_tokens);
}

export function costFromAnthropicUsage(data: {
  usage?: { input_tokens?: number; output_tokens?: number };
}): number | null {
  const usage = data.usage;
  if (!usage || typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number") return null;
  return tokenCost("claude-haiku-4-5", usage.input_tokens, usage.output_tokens);
}

/** Gemini bills "thinking"/reasoning tokens (`thoughtsTokenCount`) at
 *  the same output rate as the visible answer - confirmed empirically
 *  (2026-09) that this can be 1.5x the size of the visible text itself
 *  for a plain factual question, easily the single most expensive of
 *  the six providers per call once this is counted, and silently
 *  under-billed here by more than half if it isn't. */
export function costFromGeminiUsage(data: {
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}): number | null {
  const usage = data.usageMetadata;
  if (!usage || typeof usage.promptTokenCount !== "number") return null;
  const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  return tokenCost("gemini-3.8-flash", usage.promptTokenCount, outputTokens);
}

export function costFromDeepSeekUsage(data: {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): number | null {
  const usage = data.usage;
  if (!usage || typeof usage.prompt_tokens !== "number" || typeof usage.completion_tokens !== "number") return null;
  return tokenCost("deepseek-v4-flash", usage.prompt_tokens, usage.completion_tokens);
}

/** xAI reports its own exact billed cost directly - 1 USD = 10,000,000,000
 *  ticks (confirmed against https://docs.x.ai/developers/cost-tracking,
 *  2026-09; do NOT re-derive this from token counts + a rate table, an
 *  earlier draft of this module got the tick divisor wrong by 100x
 *  before this was checked against the actual docs). */
export function costFromGrokUsage(data: { usage?: { cost_in_usd_ticks?: number } }): number | null {
  const ticks = data.usage?.cost_in_usd_ticks;
  if (typeof ticks !== "number") return null;
  return ticks / 10_000_000_000;
}

/** Perplexity's Agent API reports its own exact billed cost directly,
 *  already summing token cost + every tool-call fee (web_search,
 *  fetch_url) - by far the most reliable figure available for this
 *  provider, since a from-scratch rate table would also need to track
 *  the Agent API's per-tool-call pricing on top of token rates. */
export function costFromPerplexityUsage(data: { usage?: { cost?: { total_cost?: number } } }): number | null {
  const total = data.usage?.cost?.total_cost;
  return typeof total === "number" ? total : null;
}
