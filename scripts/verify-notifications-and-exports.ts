/**
 * Pre-launch quality check for everything a user actually receives or
 * downloads: the CSV export, the alert email, and the Slack Block Kit
 * messages. Every value below comes from the real, shipped builder
 * functions (imported directly, not reimplemented here) fed realistic
 * sample data - no network calls, no real email/Slack message sent.
 *
 * The Business-plan report (/dashboard/report) is a full Server
 * Component that needs a live Supabase session to render, so it isn't
 * exercised here - see the accompanying written structural breakdown
 * instead.
 *
 * Run with: npx tsx scripts/verify-notifications-and-exports.ts
 */
import {
  PROVIDER_LABELS as CSV_PROVIDER_LABELS,
  SENTIMENT_LABELS,
  csvCell,
  csvRow,
  CSV_BOM,
} from "../lib/csv-export";
import { alertEmailSubject, buildAlertEmailHtml, FROM_ADDRESS } from "../lib/email";
import { buildDailySummaryBlocks, buildTestMessageBlocks } from "../lib/slack";
import type { RankingChange } from "../lib/slack";

function section(title: string) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

// ---------------------------------------------------------------------
// 1. CSV export
// ---------------------------------------------------------------------
section("1. CSV EXPORT");

console.log(`BOM present: ${CSV_BOM.charCodeAt(0) === 0xfeff} (U+${CSV_BOM.charCodeAt(0).toString(16).toUpperCase()})`);
console.log(`Content-Type header used by the route: text/csv; charset=utf-8`);

const sampleCsv =
  CSV_BOM +
  "Zonostick レポート - Zonostick\r\n" +
  "出力日時,2026/8/30 10:00:00\r\n" +
  "言及率,67%\r\n" +
  "\r\n" +
  "■ プロンプト × LLM別 最新結果\r\n" +
  csvRow(["プロンプト", "LLM", "言及", "推奨順位", "論調", "計測日時"]) +
  csvRow([
    "おすすめのイヤホンは？",
    CSV_PROVIDER_LABELS.chatgpt,
    "あり",
    1,
    SENTIMENT_LABELS.positive,
    "2026/8/30 6:03:11",
  ]) +
  csvRow(["おすすめのイヤホンは？", CSV_PROVIDER_LABELS.claude, "なし", "", "", "2026/8/30 6:03:14"]) +
  csvRow([`"競合" 入りテキスト`, CSV_PROVIDER_LABELS.perplexity, "あり", "", SENTIMENT_LABELS.neutral, "2026/8/30 6:03:20"]) +
  "\r\n" +
  "■ 競合との言及シェア(直近の計測結果ベース)\r\n" +
  csvRow(["名前", "言及回数", "シェア"]) +
  csvRow(["Zonostick", 4, "67%"]) +
  csvRow(["競合A", 2, "33%"]);

console.log("\n--- Header row (exact bytes, quoted) ---");
console.log(csvRow(["プロンプト", "LLM", "言及", "推奨順位", "論調", "計測日時"]).trimEnd());

console.log("\n--- Full sample body (as Excel would receive it) ---");
console.log(sampleCsv);

console.log(
  `Escaping check: a value containing a literal double-quote -> ${csvCell(`"競合" 入りテキスト`)} ` +
    `(quotes doubled per RFC 4180, so Excel reads it as one embedded ")`
);

// ---------------------------------------------------------------------
// 2. Alert email (Resend)
// ---------------------------------------------------------------------
section("2. ALERT EMAIL (Resend)");

const sampleAnomalies: RankingChange[] = [
  {
    brandName: "Zonostick",
    promptText: "おすすめのイヤホンは？",
    provider: "chatgpt",
    previousRank: 2,
    currentRank: null,
    mentioned: false,
  },
  {
    brandName: "Zonostick",
    promptText: "ワイヤレスイヤホン 比較",
    provider: "gemini",
    previousRank: 1,
    currentRank: 4,
    mentioned: true,
  },
];

console.log(`From: ${FROM_ADDRESS}`);
console.log(`Subject: ${alertEmailSubject("Zonostick")}`);
console.log("\n--- HTML body ---");
console.log(buildAlertEmailHtml({ brandName: "Zonostick", anomalies: sampleAnomalies }));

// A quick structural sanity check on the HTML itself: every dynamic
// value we fed in should actually appear somewhere in the output, and
// there should be exactly as many <tr> rows as anomalies (capped at 20
// in the real function).
const emailHtml = buildAlertEmailHtml({ brandName: "Zonostick", anomalies: sampleAnomalies });
const trCount = (emailHtml.match(/<tr>/g) ?? []).length;
// +1 for the table's own <thead><tr> header row, which also matches
// the bare `<tr>` pattern (no attributes on either).
const expectedTrCount = sampleAnomalies.length + 1;
console.log(
  `\nSanity: ${trCount === expectedTrCount ? "PASS" : "FAIL"} - expected ${expectedTrCount} <tr> tags ` +
    `(${sampleAnomalies.length} anomaly rows + 1 header row), found ${trCount}`
);
console.log(
  `Sanity: ${emailHtml.includes("おすすめのイヤホンは？") && emailHtml.includes("ワイヤレスイヤホン 比較") ? "PASS" : "FAIL"} - both prompt texts present`
);

// ---------------------------------------------------------------------
// 3. Slack notification (Block Kit)
// ---------------------------------------------------------------------
section("3. SLACK NOTIFICATION (Block Kit)");

const dailySummaryBlocks = buildDailySummaryBlocks({
  brandName: "Zonostick",
  checkedAt: new Date("2026-08-30T06:00:00+09:00"),
  totalPrompts: 3,
  totalChecks: 18,
  mentionRate: 0.67,
  anomalies: sampleAnomalies,
});

console.log("--- Daily summary blocks (with anomalies) ---");
console.log(JSON.stringify(dailySummaryBlocks, null, 2));

const dailySummaryNoAnomalies = buildDailySummaryBlocks({
  brandName: "Zonostick",
  checkedAt: new Date("2026-08-30T06:00:00+09:00"),
  totalPrompts: 3,
  totalChecks: 18,
  mentionRate: 0.67,
  anomalies: [],
});
console.log("\n--- Daily summary blocks (no anomalies - the 'all clear' path) ---");
console.log(JSON.stringify(dailySummaryNoAnomalies, null, 2));

console.log("\n--- Test-connection message blocks ---");
console.log(JSON.stringify(buildTestMessageBlocks(), null, 2));

// Structural checks: no block should carry an empty/undefined mrkdwn
// text (an empty Slack section throws a real API error at send time),
// and no text should contain an unescaped literal newline sequence that
// wasn't put there deliberately (Slack mrkdwn wants \n, not raw CR).
function checkBlocksForEmptyOrBrokenText(blocks: Record<string, unknown>[], label: string) {
  let issues = 0;
  const walk = (node: unknown) => {
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.text === "string") {
        if (obj.text.trim().length === 0) {
          console.log(`FAIL [${label}]: empty text field found`);
          issues++;
        }
        if (obj.text.includes("undefined") || obj.text.includes("null")) {
          console.log(`FAIL [${label}]: text contains literal "undefined"/"null" - likely a missing variable: ${obj.text}`);
          issues++;
        }
        if (obj.text.includes("\r")) {
          console.log(`FAIL [${label}]: text contains a raw \\r - Slack mrkdwn expects \\n only`);
          issues++;
        }
      }
      for (const v of Object.values(obj)) walk(v);
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    }
  };
  walk(blocks);
  if (issues === 0) console.log(`PASS [${label}]: no empty text, no missing-variable placeholders, no stray \\r`);
  return issues;
}

console.log("\n--- Structural checks ---");
let slackIssues = 0;
slackIssues += checkBlocksForEmptyOrBrokenText(dailySummaryBlocks, "daily summary (with anomalies)");
slackIssues += checkBlocksForEmptyOrBrokenText(dailySummaryNoAnomalies, "daily summary (no anomalies)");
slackIssues += checkBlocksForEmptyOrBrokenText(buildTestMessageBlocks(), "test message");

// Redesign-specific checks: status-first header, dashboard button, and
// that the removed/renamed fields ("総チェック数", old "言及率" label)
// are actually gone rather than just relabeled somewhere else.
function jsonOf(blocks: Record<string, unknown>[]): string {
  return JSON.stringify(blocks);
}
function hasDashboardButton(blocks: Record<string, unknown>[]): boolean {
  const actionsBlock = blocks.find((b) => b.type === "actions") as
    | { elements?: { type: string; url?: string }[] }
    | undefined;
  const button = actionsBlock?.elements?.find((e) => e.type === "button");
  return !!button?.url && button.url.startsWith("http") && button.url.endsWith("/dashboard");
}

const redesignChecks: [string, boolean][] = [
  [
    "no-anomaly header states 正常",
    (dailySummaryNoAnomalies[0] as { text: { text: string } }).text.text.includes("正常"),
  ],
  [
    "anomaly header states 要確認",
    (dailySummaryBlocks[0] as { text: { text: string } }).text.text.includes("要確認"),
  ],
  ["no-anomaly message has a dashboard button", hasDashboardButton(dailySummaryNoAnomalies)],
  ["anomaly message has a dashboard button", hasDashboardButton(dailySummaryBlocks)],
  ["展示に AI露出率 が使われている", jsonOf(dailySummaryNoAnomalies).includes("AI露出率")],
  ["旧表記「言及率」が完全に消えている", !jsonOf(dailySummaryNoAnomalies).includes("言及率") && !jsonOf(dailySummaryBlocks).includes("言及率")],
  ["「総チェック数」フィールドが削除されている", !jsonOf(dailySummaryNoAnomalies).includes("総チェック数") && !jsonOf(dailySummaryBlocks).includes("総チェック数")],
];

for (const [label, ok] of redesignChecks) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${label}`);
  if (!ok) slackIssues++;
}

console.log(`\n${slackIssues === 0 ? "All Slack structural checks passed." : `${slackIssues} Slack issue(s) found.`}`);

if (trCount !== expectedTrCount || slackIssues > 0) {
  process.exit(1);
}
