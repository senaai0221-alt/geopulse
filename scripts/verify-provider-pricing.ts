/**
 * Regression check for lib/provider-pricing.ts, using the REAL raw API
 * response shapes captured from a live test call to each of the 6
 * providers on 2026-09-04 (see the "黒字化設計" cost-audit session) -
 * not synthetic fixtures, so a provider changing its response shape
 * (a field renamed, usage moved) would actually be caught here instead
 * of only failing silently in production as a null cost.
 *
 * Run: npx tsx scripts/verify-provider-pricing.ts
 */
import {
  costFromOpenAiUsage,
  costFromAnthropicUsage,
  costFromGeminiUsage,
  costFromGrokUsage,
  costFromDeepSeekUsage,
  costFromPerplexityUsage,
} from "../lib/provider-pricing";

let pass = 0;
let fail = 0;

function check(label: string, actual: number | null, expected: number | null, tolerance = 0.000001) {
  const ok =
    expected === null ? actual === null : actual !== null && Math.abs(actual - expected) < tolerance;
  if (ok) {
    pass++;
    console.log(`PASS - ${label} (${actual})`);
  } else {
    fail++;
    console.log(`FAIL - ${label}: expected ${expected}, got ${actual}`);
  }
}

// --- ChatGPT (gpt-5.6-luna) - real response from a live test call
// (2026-09 model-currency sweep - see geo-engine.ts DEFAULT_OPENAI_MODEL) ---
{
  const data = {
    usage: {
      prompt_tokens: 18,
      completion_tokens: 451,
      total_tokens: 469,
      completion_tokens_details: { reasoning_tokens: 153 },
    },
  };
  // reasoning_tokens is a SUBSET of completion_tokens here (unlike
  // Grok's separate reasoning_tokens field, which sits outside
  // completion_tokens) - OpenAI's own completion_tokens is already the
  // full billable output count, so no separate addition needed.
  // 18*0.20/1e6 + 451*1.20/1e6 = 0.0000036 + 0.0005412 = 0.0005448
  check("ChatGPT (gpt-5.6-luna) real usage", costFromOpenAiUsage(data, "gpt-5.6-luna"), 0.0005448);
}
{
  // judgeBrandTreatment's own model - same helper, different rate key.
  const data = { usage: { prompt_tokens: 100, completion_tokens: 20 } };
  // 100*0.15/1e6 + 20*0.6/1e6 = 0.000015 + 0.000012 = 0.000027
  check("ChatGPT (gpt-4o-mini judge) synthetic usage", costFromOpenAiUsage(data, "gpt-4o-mini"), 0.000027);
}
check("ChatGPT missing usage returns null (never silently 0)", costFromOpenAiUsage({}, "gpt-5.6-luna"), null);

// --- Claude (Haiku 4.5) - real response ---
{
  const data = { usage: { input_tokens: 26, output_tokens: 358 } };
  // 26*1/1e6 + 358*5/1e6 = 0.000026 + 0.00179 = 0.001816
  check("Claude (Haiku 4.5) real usage", costFromAnthropicUsage(data), 0.001816);
}
check("Claude missing usage returns null", costFromAnthropicUsage({}), null);

// --- Gemini (3.6 Flash) - real response, INCLUDING the hidden thinking tokens ---
{
  const data = {
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 961, thoughtsTokenCount: 1415 },
  };
  // output billed = candidates + thoughts = 2376
  // 10*0.75/1e6 + 2376*3.75/1e6 = 0.0000075 + 0.00891 = 0.0089175
  check("Gemini real usage (thinking tokens billed as output)", costFromGeminiUsage(data), 0.0089175);
}
{
  // No thoughtsTokenCount at all (a non-thinking response) - must not
  // throw or treat the missing field as anything other than 0 extra.
  const data = { usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 100 } };
  // 5*0.75/1e6 + 100*3.75/1e6 = 0.00000375 + 0.000375 = 0.00037875
  check("Gemini usage with no thinking tokens", costFromGeminiUsage(data), 0.00037875);
}
check("Gemini missing usage returns null", costFromGeminiUsage({}), null);

// --- Grok - real response, self-reported cost_in_usd_ticks ---
{
  // The exact real value observed 2026-09-04. 1 USD = 10,000,000,000
  // ticks (verified against https://docs.x.ai/developers/cost-tracking)
  // - an earlier draft of provider-pricing.ts had this divisor wrong by
  // 100x before it was checked against the actual docs; this case
  // exists specifically to catch that regression again.
  const data = { usage: { cost_in_usd_ticks: 18568500 } };
  check("Grok real self-reported cost (tick divisor)", costFromGrokUsage(data), 0.00185685);
}
check("Grok missing usage returns null", costFromGrokUsage({}), null);

// --- DeepSeek (v4-flash) - real response ---
{
  const data = { usage: { prompt_tokens: 15, completion_tokens: 808 } };
  // 15*0.22/1e6 + 808*0.66/1e6 = 0.0000033 + 0.00053328 = 0.00053658
  check("DeepSeek real usage", costFromDeepSeekUsage(data), 0.00053658);
}
check("DeepSeek missing usage returns null", costFromDeepSeekUsage({}), null);

// --- Perplexity - real response, self-reported total_cost ---
{
  const data = { usage: { cost: { total_cost: 0.00767 } } };
  check("Perplexity real self-reported total cost", costFromPerplexityUsage(data), 0.00767);
}
check("Perplexity missing usage returns null", costFromPerplexityUsage({}), null);

console.log(`\n${pass}/${pass + fail} cases passed.`);
if (fail > 0) process.exit(1);
