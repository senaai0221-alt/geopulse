/**
 * Regression check for the *root cause* of the "テストブランド falsely
 * marked as mentioned" incident: the old `mentioned: parsed.mentioned ||
 * judge.mentioned` combinator in buildResult() let a hallucinating
 * secondary LLM judge call flip the final verdict to `true` even when
 * the brand's name never appeared in the raw response text at all.
 *
 * This drives the REAL, shipped pipeline end-to-end
 * (runSingleProviderQuery -> buildResult -> judgeBrandTreatment), with
 * both outbound HTTP calls (DeepSeek, then the OpenAI judge) intercepted
 * via a mocked global.fetch - no real network or API keys needed. The
 * mocked judge response deliberately reproduces the exact failure mode:
 * a confident non-null sentiment/rank for a brand that is nowhere in the
 * DeepSeek text (Anker only). Before the fix, this alone was enough to
 * make `mentioned` come back `true`. After the fix, buildResult() never
 * even calls the judge for an unmentioned brand, so this can't happen
 * structurally - not just because this one prompt happened to get
 * filtered out.
 *
 * Run with: npx tsx scripts/verify-judge-gating.ts
 */
process.env.DEEPSEEK_API_KEY = "test-key";
process.env.OPENAI_API_KEY = "test-key";

let openaiJudgeCalls = 0;

const realFetch = global.fetch;
global.fetch = (async (url: string | URL, init?: RequestInit) => {
  const href = typeof url === "string" ? url : url.toString();

  if (href.includes("api.deepseek.com")) {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "おすすめのワイヤレスイヤホンをいくつかご紹介します。\n\n" +
                "1. Ankerのイヤホンはコストパフォーマンスに優れています。\n" +
                "2. Soundcoreも人気があり、ノイズキャンセリング機能が魅力です。",
            },
          },
        ],
      }),
      { status: 200 }
    );
  }

  if (href.includes("api.openai.com")) {
    openaiJudgeCalls++;
    // A hallucinating judge: confidently returns a positive sentiment
    // and rank #1 for "テストブランド", despite it never appearing in
    // the DeepSeek text above. This is the exact malfunction from the
    // incident report.
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ sentiment: "positive", recommendation_rank: 1 }),
            },
          },
        ],
      }),
      { status: 200 }
    );
  }

  throw new Error(`Unexpected fetch in test: ${href}`);
}) as typeof fetch;

async function main() {
  const { runSingleProviderQuery } = await import("../lib/geo-engine");

  const result = await runSingleProviderQuery("deepseek", {
    prompt: "おすすめのワイヤレスイヤホンは？",
    brandName: "テストブランド",
    competitors: [],
  });

  global.fetch = realFetch;

  console.log("Result:", JSON.stringify(result, null, 2));
  console.log(`OpenAI judge endpoint called: ${openaiJudgeCalls} time(s)`);

  let failures = 0;

  if (result.mentioned !== false) {
    console.log(`FAIL - expected mentioned=false, got mentioned=${result.mentioned}`);
    failures++;
  } else {
    console.log("PASS - mentioned=false despite a hallucinating judge response");
  }

  if (result.sentiment !== null) {
    console.log(`FAIL - expected sentiment=null, got sentiment=${result.sentiment}`);
    failures++;
  } else {
    console.log("PASS - sentiment=null (hallucinated judge sentiment was not carried through)");
  }

  if (result.rankPosition !== null) {
    console.log(`FAIL - expected rankPosition=null, got rankPosition=${result.rankPosition}`);
    failures++;
  } else {
    console.log("PASS - rankPosition=null (hallucinated judge rank was not carried through)");
  }

  if (openaiJudgeCalls !== 0) {
    console.log(
      `FAIL - expected the OpenAI judge endpoint to be skipped entirely for an unmentioned brand, ` +
        `but it was called ${openaiJudgeCalls} time(s)`
    );
    failures++;
  } else {
    console.log("PASS - judge call was skipped entirely (parsed.mentioned=false gated it out)");
  }

  console.log(`\n${4 - failures}/4 checks passed.`);
  if (failures > 0) {
    console.error(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
}

main();
