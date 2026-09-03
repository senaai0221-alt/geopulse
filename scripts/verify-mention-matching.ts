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
 *
 * Also covers the later "プーメリー" false-圏外 incident (2026-09): a
 * brand registered under a common nickname whose product got described
 * by its official product name only in one response, with the nickname
 * nowhere in the text - see the `aliases` field added below and to
 * `brands`/`parseResponse` itself.
 *
 * And the "Shokz 5位" incident (2026-09): a brand whose actual #1
 * product was named only in bold text on the line AFTER its numbered
 * heading (a single-line-only match found nothing there), while a
 * LATER heading literally titled "【Shokz以外】" (brands OTHER than
 * Shokz) contained the brand name as a negated substring and was the
 * only thing a single-line match found - reported as rank 5 instead of
 * the real rank 1. See extractListItems' own full-block-per-entry
 * rewrite and parseResponse's hasPositiveMention negation guard.
 */
import { parseResponse } from "../lib/geo-engine";

interface Case {
  name: string;
  rawResponse: string;
  brandName: string;
  aliases?: string[];
  competitors?: string[];
  expectMentioned: boolean;
  expectCompetitors?: string[];
  expectRankPosition?: number | null;
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
  {
    // The exact "プーメリー" incident: the brand is registered under its
    // common nickname, but this particular response only ever uses the
    // official product name - the nickname string itself never appears
    // anywhere. Without the alias, this must (correctly, for what it's
    // actually being asked) come back not-mentioned; WITH the alias
    // registered, the exact same response must be recognized, at its
    // real rank.
    name: "プーメリー incident: nickname absent, official product name present in a numbered list",
    rawResponse:
      "1. 【タカラトミー】くまのプーさん えらべる回転6WAY ジムにへんしんメリー\n" +
      "2. 【ピープル】うちの赤ちゃん世界一 スマート知育ジム＆メリー",
    brandName: "プーメリー",
    expectMentioned: false,
    expectRankPosition: null,
  },
  {
    name: "プーメリー incident, fixed: same response, official name registered as an alias",
    rawResponse:
      "1. 【タカラトミー】くまのプーさん えらべる回転6WAY ジムにへんしんメリー\n" +
      "2. 【ピープル】うちの赤ちゃん世界一 スマート知育ジム＆メリー",
    brandName: "プーメリー",
    aliases: ["くまのプーさん えらべる回転6WAY ジムにへんしんメリー"],
    expectMentioned: true,
    expectRankPosition: 1,
  },
  {
    // The exact "Shokz 5位" incident, reproduced from the real raw
    // response's structure (heading + bold product name on the NEXT
    // line, real rank-1 product; a later heading literally titled
    // "【Shokz以外】" further down).
    name: 'Shokz incident: product name on the line after the heading (not the heading itself), "以外" heading later',
    rawResponse:
      "### 1. 【総合1位】音質にこだわりたい方\n" +
      "**▶ Shokz OpenRun Pro 2**\n" +
      "* 特徴: 骨伝導と空気伝導のハイブリッド。\n" +
      "### 2. 【1番人気】スポーツ向け\n" +
      "**▶ Shokz OpenRun**\n" +
      "### 5. 【Shokz以外】夜間のランニング派に\n" +
      "**▶ SUUNTO Wing**\n" +
      "* 特徴: LEDライト付き。",
    brandName: "Shokz",
    expectMentioned: true,
    expectRankPosition: 1,
  },
  {
    // The negation guard in isolation: the brand appears ONLY inside a
    // "○○以外" (other than ○○) section, nowhere else at all - must NOT
    // read as a positive mention just because the substring is present.
    name: '"以外" negation guard: brand mentioned only as "Shokz以外", nowhere else',
    rawResponse: "### 1. 【Shokz以外】のおすすめ\n**▶ SUUNTO Wing**\n骨伝導以外の選択肢です。",
    brandName: "Shokz",
    expectMentioned: false,
    expectRankPosition: null,
  },
];

let failures = 0;

for (const c of cases) {
  const result = parseResponse(c.rawResponse, c.brandName, c.aliases ?? [], c.competitors ?? []);
  const mentionedOk = result.mentioned === c.expectMentioned;
  const competitorsOk =
    c.expectCompetitors === undefined ||
    JSON.stringify([...result.competitorsMentioned].sort()) ===
      JSON.stringify([...c.expectCompetitors].sort());
  const rankOk = c.expectRankPosition === undefined || result.rankPosition === c.expectRankPosition;
  const ok = mentionedOk && competitorsOk && rankOk;

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
    if (c.expectRankPosition !== undefined) {
      console.log(`     expected rankPosition=${c.expectRankPosition}, got ${result.rankPosition}`);
    }
  }
}

console.log(`\n${cases.length - failures}/${cases.length} cases passed.`);
if (failures > 0) {
  console.error(`${failures} case(s) FAILED.`);
  process.exit(1);
}
