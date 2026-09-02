/**
 * Regression check for the "2位→12位" false rank-drop alert incident
 * (2026-09): a user reported an alert claiming a brand's rank dropped
 * to a specific numbered position in an LLM response that, per the
 * user's own inspection of raw_response, never contained any ranked
 * list at all - just prose comparing two products.
 *
 * Two independent bugs in lib/geo-engine.ts fed this, both fixed here:
 *
 * 1. buildResult() used to fall back to the OpenAI judge call's own
 *    `recommendation_rank` whenever the deterministic regex parser
 *    found no rank. The judge's prompt explicitly instructs it to
 *    return null for exactly this kind of prose/comparison text, but
 *    in practice it didn't reliably follow that instruction - this
 *    test's mocked judge deliberately disobeys it and returns
 *    recommendation_rank: 10, reproducing that half of the failure.
 * 2. extractListItems() had its OWN independent source of a fabricated
 *    rank: a "paragraph splitting" fallback that ran when neither a
 *    real numbered/bulleted list nor a heading-list was found, treating
 *    "which paragraph mentions the brand first" as if it were a rank.
 *    This test's mocked response is deliberately plain, multi-paragraph
 *    prose with the brand only in the 2nd paragraph, so this half would
 *    have fabricated rank_position 2 all on its own - even with bug #1
 *    fixed and even if the judge had behaved perfectly.
 *
 * This drives the REAL, shipped pipeline end-to-end
 * (runSingleProviderQuery -> buildResult -> judgeBrandTreatment), with
 * both outbound HTTP calls (DeepSeek, then the OpenAI judge)
 * intercepted via a mocked global.fetch - no real network or API keys
 * needed. Before the fix, either bug alone would have produced a
 * non-null rank_position for this response. After the fix, neither
 * path can - this can't happen structurally, not just because this one
 * response happened not to trigger it.
 *
 * Run with: npx tsx scripts/verify-rank-hallucination-fix.ts
 */
// A no-op export - its only purpose is making this file an ES module
// (isolated top-level scope) rather than a global script, so its
// top-level `let openaiJudgeCalls` etc. can't collide with the same
// names in sibling scripts/*.ts files that also have no other
// top-level import/export (e.g. verify-judge-gating.ts) - `tsc`
// otherwise treats every import-less .ts file as sharing one global
// scope, which surfaced as a real "next build" type error.
export {};

process.env.DEEPSEEK_API_KEY = "test-key";
process.env.OPENAI_API_KEY = "test-key";

let openaiJudgeCalls = 0;

const realFetch = global.fetch;
global.fetch = (async (url: string | URL, init?: RequestInit) => {
  const href = typeof url === "string" ? url : url.toString();

  if (href.includes("api.deepseek.com")) {
    // Comparison prose, not a ranked list - "テストブランド" appears in
    // running text, never as a numbered/bulleted entry. This is exactly
    // the shape of response the incident's raw_response had.
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "2つの候補について、それぞれの強みをご紹介します。\n\n" +
                "競合Aはシンプルなノート機能に特化しており、素早くメモを取りたい人に向いています。" +
                "一方でテストブランドはタスク管理やデータベース機能も備えており、" +
                "チームでの情報共有やプロジェクト管理を一元化したい人に向いています。\n\n" +
                "用途に応じてどちらが合うかが変わってくるため、まずは主な使い方を教えていただけると、" +
                "より具体的な提案ができます。",
            },
          },
        ],
      }),
      { status: 200 }
    );
  }

  if (href.includes("api.openai.com")) {
    openaiJudgeCalls++;
    // A hallucinating judge: despite its own prompt explicitly saying
    // comparison-style text must get recommendation_rank: null, it
    // confidently returns #10 anyway - the exact malfunction from the
    // incident report. The fix must ignore this field entirely, not
    // just hope the model behaves.
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ sentiment: "neutral", recommendation_rank: 10 }),
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
    prompt: "競合Aとテストブランドを比べるとどちらがいい？",
    brandName: "テストブランド",
    competitors: ["競合A"],
  });

  global.fetch = realFetch;

  console.log("Result:", JSON.stringify(result, null, 2));
  console.log(`OpenAI judge endpoint called: ${openaiJudgeCalls} time(s)`);

  let failures = 0;

  if (result.mentioned !== true) {
    console.log(`FAIL - expected mentioned=true (the brand name genuinely is in the text), got ${result.mentioned}`);
    failures++;
  } else {
    console.log("PASS - mentioned=true (the brand name is genuinely present in the comparison prose)");
  }

  if (result.rankPosition !== null) {
    console.log(
      `FAIL - expected rankPosition=null (no real ranked list in the response), got rankPosition=${result.rankPosition} ` +
        `- the judge's hallucinated recommendation_rank leaked through`
    );
    failures++;
  } else {
    console.log("PASS - rankPosition=null despite the judge hallucinating recommendation_rank: 10");
  }

  if (openaiJudgeCalls !== 1) {
    console.log(
      `FAIL - expected the OpenAI judge endpoint to be called exactly once (for sentiment, since the brand IS ` +
        `mentioned), but it was called ${openaiJudgeCalls} time(s)`
    );
    failures++;
  } else {
    console.log("PASS - judge was called once (still used for sentiment - only its rank opinion is now ignored)");
  }

  console.log(`\n${3 - failures}/3 checks passed.`);
  if (failures > 0) {
    console.error(`${failures} check(s) FAILED.`);
    process.exit(1);
  }
}

main();
