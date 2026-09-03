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
  FLAT_CSV_HEADERS,
  csvCell,
  csvRow,
  CSV_BOM,
  extractMentionSnippet,
} from "../lib/csv-export";
import { alertEmailSubject, buildAlertEmailHtml, FROM_ADDRESS } from "../lib/email";
import { buildDailySummaryBlocks, buildTestMessageBlocks } from "../lib/slack";
import type { RankingChange } from "../lib/slack";
import { buildAnomalyMessage } from "../lib/alert-message";

function section(title: string) {
  console.log(`\n${"=".repeat(70)}\n${title}\n${"=".repeat(70)}`);
}

// ---------------------------------------------------------------------
// 1. CSV export
// ---------------------------------------------------------------------
section("1. CSV EXPORT");

console.log(`BOM present: ${CSV_BOM.charCodeAt(0) === 0xfeff} (U+${CSV_BOM.charCodeAt(0).toString(16).toUpperCase()})`);
console.log(`Content-Type header used by the route: text/csv; charset=utf-8`);
console.log(`Gate: Pro/Business only (see app/api/export/csv/route.ts's plan check) - 403 for a Free account.`);

// Flat, 1-row-per-measurement-event log (replaced the old two-section
// human-readable summary - see app/api/export/csv/route.ts) - built for
// pasting straight into Excel/Looker Studio/Sheets to pivot, not for
// reading top-to-bottom.
const longRawResponse =
  "国内で人気のワイヤレスイヤホンをいくつか紹介します。".repeat(6) +
  "特にZonostickは装着感とノイズキャンセリング性能のバランスが良く、通勤時の利用にもおすすめです。" +
  "そのほかにも様々な選択肢があります。".repeat(6);

const sampleSnippet = extractMentionSnippet(longRawResponse, "Zonostick");

const sampleCsv =
  CSV_BOM +
  csvRow(FLAT_CSV_HEADERS) +
  csvRow([
    "2026/8/30 6:03:11",
    "Zonostick",
    "おすすめのイヤホンは？",
    "比較系",
    CSV_PROVIDER_LABELS.chatgpt,
    1,
    1,
    SENTIMENT_LABELS.positive,
    sampleSnippet,
    "",
  ]) +
  csvRow(["2026/8/30 6:03:14", "Zonostick", "おすすめのイヤホンは？", "比較系", CSV_PROVIDER_LABELS.claude, 0, "", "", "", ""]) +
  csvRow([
    "2026/8/30 6:03:20",
    "Zonostick",
    `"競合" 入りテキスト`,
    "",
    CSV_PROVIDER_LABELS.perplexity,
    1,
    "",
    SENTIMENT_LABELS.neutral,
    "…Zonostickは総合力で選ばれることが多い製品です…",
    "https://example.com/review-a; https://example.com/review-b",
  ]);

console.log("\n--- Header row (exact bytes, quoted) ---");
console.log(csvRow(FLAT_CSV_HEADERS).trimEnd());

console.log("\n--- Full sample body (as Excel would receive it) ---");
console.log(sampleCsv);

console.log(
  `Escaping check: a value containing a literal double-quote -> ${csvCell(`"競合" 入りテキスト`)} ` +
    `(quotes doubled per RFC 4180, so Excel reads it as one embedded ")`
);

console.log(
  `\nmention_snippet check: a ${longRawResponse.length}-char raw response clips to ${sampleSnippet.length} chars ` +
    `around the brand mention:\n  ${sampleSnippet}`
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

// Same instant used for the Slack section below - 06:00 JST on
// 2026-08-30, given with an explicit +09:00 offset so this test means
// the same thing regardless of the machine/CI runner's own local
// timezone. This is also what exercises the JST timestamp fix: this
// script itself may run on a JST machine (a JST dev box would mask a
// timezone bug the exact same way it did in production before this
// fix - see lib/jst.ts's own comment), so the sanity check below
// asserts the JST calendar date literally, not just "some date".
const emailCheckedAt = new Date("2026-08-30T06:00:00+09:00");

console.log(`From: ${FROM_ADDRESS}`);
console.log(`Subject: ${alertEmailSubject("Zonostick")}`);
console.log("\n--- HTML body ---");
console.log(buildAlertEmailHtml({ brandName: "Zonostick", anomalies: sampleAnomalies, checkedAt: emailCheckedAt }));

// A quick structural sanity check on the HTML itself: every dynamic
// value we fed in should actually appear somewhere in the output, and
// there should be exactly as many <tr> rows as anomalies (capped at 20
// in the real function).
const emailHtml = buildAlertEmailHtml({ brandName: "Zonostick", anomalies: sampleAnomalies, checkedAt: emailCheckedAt });
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
const emailJstOk = emailHtml.includes("2026年8月30日") && emailHtml.includes("(JST)");
console.log(
  `Sanity: ${emailJstOk ? "PASS" : "FAIL"} - checkedAt renders as the correct JST calendar date, not shifted by the runner's own local timezone`
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

// ---------------------------------------------------------------------
// 4. Shared alert message formatter (lib/alert-message.ts)
// ---------------------------------------------------------------------
section("4. SHARED ALERT MESSAGE FORMATTER (alerts.message)");

// Same two sampleAnomalies used for the email/Slack sections above -
// this is exactly the point of lib/alert-message.ts existing: one
// RankingChange, one formatter, reused by all three notification
// surfaces (the DB column here, plus email/Slack above) instead of
// three independently hand-written copies.
let formatterIssues = 0;
for (const change of sampleAnomalies) {
  const msg = buildAnomalyMessage(change);
  console.log(`[${change.mentioned ? "worsened" : "disappeared"}] ${msg}`);

  if (!change.mentioned) {
    // The exact class of bug this whole module exists to make
    // structurally impossible: a "disappeared" message may correctly
    // show the real, known PREVIOUS rank (e.g. "#2 →" - that number is
    // genuine, already-measured data), but the CURRENT side of the
    // arrow must never be a fabricated number - only "圏外", never a
    // stray "→ #12" or "→ 12位" standing in for data that never
    // existed.
    if (/→\s*#\d|→\s*\d+位/.test(msg)) {
      console.log(`FAIL - disappeared-case message claims a numeric CURRENT rank: ${msg}`);
      formatterIssues++;
    } else {
      console.log("PASS - disappeared-case message's current side says 圏外, not a fabricated number");
    }
    if (!msg.includes("圏外")) {
      console.log(`FAIL - disappeared-case message doesn't say 圏外: ${msg}`);
      formatterIssues++;
    } else {
      console.log("PASS - disappeared-case message says 圏外");
    }
  } else {
    if (!msg.includes(`#${change.previousRank}`) || !msg.includes(`#${change.currentRank}`)) {
      console.log(`FAIL - worsened-case message is missing one of the real rank numbers: ${msg}`);
      formatterIssues++;
    } else {
      console.log("PASS - worsened-case message shows both real rank numbers");
    }
  }
}
console.log(
  `\n${formatterIssues === 0 ? "All alert-message formatter checks passed." : `${formatterIssues} formatter issue(s) found.`}`
);

section("5. possibleMismatch hint (ドコモ 圏外 incident, 2026-09)");

let mismatchIssues = 0;

const mismatchChange: RankingChange = {
  brandName: "ドコモ",
  promptText: "今一番おすすめの携帯会社はどこ？",
  provider: "grok",
  previousRank: 3,
  currentRank: null,
  mentioned: false,
  possibleMismatch: "docomo",
};
const mismatchMsg = buildAnomalyMessage(mismatchChange);
console.log(mismatchMsg);
if (!mismatchMsg.includes("表記ゆれ") || !mismatchMsg.includes("docomo")) {
  console.log("FAIL - alerts.message doesn't surface the possibleMismatch hint");
  mismatchIssues++;
} else {
  console.log("PASS - alerts.message surfaces the possibleMismatch hint with the near-miss word quoted");
}
// The deterministic verdict itself must stay completely untouched by
// the hint - possibleMismatch is a caveat, never a silent override.
if (!mismatchMsg.includes("圏外")) {
  console.log("FAIL - the underlying 圏外 verdict must still be stated, not replaced by the hint");
  mismatchIssues++;
} else {
  console.log("PASS - the underlying 圏外 verdict is still stated alongside the hint");
}

// No hint at all (the common case - severity=critical with no near
// miss found, or a warning-severity change where this is never even
// computed) must render exactly like before - no stray "undefined" or
// empty caveat text leaking in.
const noMismatchChange: RankingChange = { ...mismatchChange, possibleMismatch: null };
const noMismatchMsg = buildAnomalyMessage(noMismatchChange);
if (noMismatchMsg.includes("表記ゆれ") || noMismatchMsg.includes("undefined")) {
  console.log(`FAIL - a null possibleMismatch leaked a hint or "undefined" into the message: ${noMismatchMsg}`);
  mismatchIssues++;
} else {
  console.log("PASS - a null possibleMismatch renders identically to the pre-existing message (no stray hint)");
}

console.log(
  `\n${mismatchIssues === 0 ? "All possibleMismatch hint checks passed." : `${mismatchIssues} issue(s) found.`}`
);

if (trCount !== expectedTrCount || slackIssues > 0 || formatterIssues > 0 || !emailJstOk || mismatchIssues > 0) {
  process.exit(1);
}
