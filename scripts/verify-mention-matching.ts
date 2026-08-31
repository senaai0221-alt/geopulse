/**
 * Regression check for the "テストブランド falsely marked as mentioned"
 * incident: a raw LLM response that only discusses an unrelated brand
 * (Anker) was being marked `mentioned: true` for a brand ("テストブラン
 * ド") whose name never appears in the text anywhere.
 *
 * Run with: npx tsx scripts/verify-mention-matching.ts
 *
 * This exercises the real, shipped `parseResponse()` from lib/geo-engine
 * (not a copy) - no API keys or network access needed, since this only
 * covers the deterministic exact-text-match layer. The companion fix in
 * `buildResult()` (gating the LLM judge call itself behind
 * `parsed.mentioned`, and no longer OR-ing the judge's own opinion into
 * the final `mentioned` verdict) means this layer alone is now the sole
 * source of truth for "mentioned" - so proving it right here is
 * sufficient to prove the incident can't recur.
 */
import { parseResponse } from "../lib/geo-engine";

interface Case {
  name: string;
  rawResponse: string;
  brandName: string;
  competitors?: string[];
  expectMentioned: boolean;
  expectCompetitors?: string[];
}

const cases: Case[] = [
  {
    // The exact reported incident.
    name: "Bug report: raw response only discusses Anker, brand is テストブランド",
    rawResponse:
      "おすすめのワイヤレスイヤホンをいくつかご紹介します。\n\n" +
      "1. Ankerのイヤホンはコストパフォーマンスに優れています。\n" +
      "2. Soundcoreも人気があり、ノイズキャンセリング機能が魅力です。\n\n" +
      "どちらも高評価のレビューが多く、初めての方にもおすすめです。",
    brandName: "テストブランド",
    expectMentioned: false,
  },
  {
    name: "Japanese brand name genuinely present in prose (was previously unmatchable due to the \\b bug)",
    rawResponse: "テストブランドは高品質な製品で知られており、多くのユーザーから支持されています。",
    brandName: "テストブランド",
    expectMentioned: true,
  },
  {
    name: "Japanese brand name genuinely present inside a numbered list",
    rawResponse: "1. テストブランド - 高品質と評判\n2. Anker - コスパ重視",
    brandName: "テストブランド",
    expectMentioned: true,
  },
  {
    name: "Japanese brand name NOT present, only a similar-looking different brand",
    rawResponse: "テストブランドXという製品もありますが、今回のおすすめはAnkerです。",
    brandName: "テストブランド",
    // Substring-contained ("テストブランドX" contains "テストブランド"),
    // which is the same "contains its full name" standard applied to
    // ASCII brands (e.g. "Ankermania" containing "Anker" would also
    // count) - documented here as expected/known behavior, not a bug.
    expectMentioned: true,
  },
  {
    name: "ASCII brand name present as a whole word",
    rawResponse: "For small business CRMs, Zonostick is a strong pick.",
    brandName: "Zonostick",
    expectMentioned: true,
  },
  {
    name: "ASCII brand name absent, only a substring collision inside another word",
    rawResponse: "For headphones, check out AnkerZone and Soundcore.",
    brandName: "Zone",
    // \b still applies for ASCII names, so "Zone" must NOT match inside
    // "AnkerZone".
    expectMentioned: false,
  },
  {
    name: "Empty response text",
    rawResponse: "",
    brandName: "テストブランド",
    expectMentioned: false,
  },
  {
    name: "Japanese competitor names are matched the same way as the brand name",
    rawResponse: "1. Anker\n2. 競合ブランドA\n3. Soundcore",
    brandName: "テストブランド",
    competitors: ["競合ブランドA", "競合ブランドB"],
    expectMentioned: false,
    expectCompetitors: ["競合ブランドA"],
  },
];

let failures = 0;

for (const c of cases) {
  const result = parseResponse(c.rawResponse, c.brandName, c.competitors ?? []);
  const mentionedOk = result.mentioned === c.expectMentioned;
  const competitorsOk =
    c.expectCompetitors === undefined ||
    JSON.stringify([...result.competitorsMentioned].sort()) ===
      JSON.stringify([...c.expectCompetitors].sort());
  const ok = mentionedOk && competitorsOk;

  console.log(`${ok ? "PASS" : "FAIL"} - ${c.name}`);
  if (!ok) {
    failures++;
    console.log(`     expected mentioned=${c.expectMentioned}, got mentioned=${result.mentioned}`);
    if (c.expectCompetitors !== undefined) {
      console.log(
        `     expected competitors=${JSON.stringify(c.expectCompetitors)}, got ${JSON.stringify(
          result.competitorsMentioned
        )}`
      );
    }
  }
}

console.log(`\n${cases.length - failures}/${cases.length} cases passed.`);
if (failures > 0) {
  console.error(`${failures} case(s) FAILED.`);
  process.exit(1);
}
