/**
 * Slack notification helpers - builds Block Kit payloads and posts them
 * to an Incoming Webhook URL. Used by the daily cron job to send a
 * per-user summary plus any detected ranking anomalies.
 */

import { PROVIDER_LABELS, rankLabel, type RankingChange } from "./alert-message";
import { formatJstIntl } from "./jst";

// Re-exported so every existing `import { type RankingChange } from
// "./slack"` (or "@/lib/slack") keeps working unchanged - its
// canonical home moved to lib/alert-message.ts, which both this file
// and lib/email.ts now depend on for the shared rankLabel/
// PROVIDER_LABELS formatting (see that module's own comment for why).
export type { RankingChange };

export interface DailySummaryInput {
  brandName: string;
  checkedAt: Date;
  totalPrompts: number;
  totalChecks: number;
  mentionRate: number; // 0-1
  anomalies: RankingChange[];
}

// Fallback mirrors lib/email.ts's APP_URL constant - both point the
// user back into the app from a notification, so they must resolve to
// the same place. NEXT_PUBLIC_APP_URL is expected to be set in
// production; this is only what a dev/misconfigured environment falls
// back to.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.zonostick.com";

function severityEmoji(change: RankingChange): string {
  if (change.severity === "critical") return "🔴";
  if (change.severity === "warning") return "🟠";
  return "🟡"; // "info" - rank became unknown, not confirmed worse
}

/**
 * Builds the Slack Block Kit payload for the daily summary + anomalies.
 *
 * Conclusion-first, not a data dump: the header block itself states the
 * one thing a reader needs before anything else - is this brand fine
 * today, or does it need attention - since a header renders as the
 * largest, boldest text Slack has. Everything below either confirms
 * that ("正常" + the two numbers that actually matter, AI露出率 and
 * how many prompts were behind them) or explains it (the anomaly list,
 * each one showing exactly which prompt/LLM moved and from what to
 * what). Internal operational counts that don't change what the reader
 * should do next (raw total-checks, an explicit anomaly-count field
 * that's just restating what the header already conveys) are left out
 * entirely rather than competing for attention with the one number that
 * matters.
 */
export function buildDailySummaryBlocks(input: DailySummaryInput) {
  // Pinned to JST (see lib/jst.ts) - the cron runs at 07:00-07:30 JST,
  // which is still the PREVIOUS calendar day in UTC (Vercel's server
  // default with no timeZone given), so this used to label every
  // single daily summary with yesterday's date.
  const dateLabel = formatJstIntl(input.checkedAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const mentionRatePct = Math.round(input.mentionRate * 100);
  const hasAnomalies = input.anomalies.length > 0;
  // "info" (rank became unknown, still mentioned - see daily-check/
  // route.ts's third isAnomaly branch) is real signal but not urgent -
  // an info-only day gets its own header tier rather than either
  // "🚨 要確認" (overstates it - nothing actually got worse) or being
  // silently folded into "✅ 正常" (which would bring back the exact
  // zero-signal gap this branch exists to close).
  const hasUrgent = input.anomalies.some((a) => a.severity !== "info");

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: hasUrgent
          ? `🚨 要確認 - ${input.brandName}`
          : hasAnomalies
            ? `🟡 順位不明の項目あり - ${input.brandName}`
            : `✅ ステータス: 正常 - ${input.brandName}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Zonostick 日次レポート · ${dateLabel} の計測結果` }],
    },
  ];

  if (!hasAnomalies) {
    blocks.push({
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*AI露出率:*\n${mentionRatePct}%` },
        { type: "mrkdwn", text: `*計測プロンプト数:*\n${input.totalPrompts}` },
      ],
    });
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: hasUrgent
          ? `*AI露出率:* ${mentionRatePct}% ・ 以下 ${input.anomalies.length}件で順位の急落・除外を検知しました:`
          : `*AI露出率:* ${mentionRatePct}% ・ 以下 ${input.anomalies.length}件で順位が一時的に不明になりました（掲載自体は継続中）:`,
      },
    });
    blocks.push({ type: "divider" });

    for (const change of input.anomalies.slice(0, 20)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `${severityEmoji(change)} *${PROVIDER_LABELS[change.provider]}* ` +
            `- 「${change.promptText}」\n` +
            `　順位: ${rankLabel(change.previousRank, true)} → *${rankLabel(
              change.currentRank,
              change.mentioned
            )}*` +
            // See RankingChange.possibleMismatch's own comment (lib/
            // alert-message.ts) - a hedge, not a retraction: the
            // deterministic verdict above still stands, this just
            // flags a plausible reason to double-check it before
            // acting.
            (change.possibleMismatch
              ? `\n　⚠️ 表記ゆれの可能性（原文の「${change.possibleMismatch}」表記をご確認ください）`
              : ""),
        },
      });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "ダッシュボードを開く", emoji: true },
        url: `${APP_URL}/dashboard`,
        style: hasAnomalies ? "primary" : undefined,
      },
    ],
  });

  return blocks;
}

export interface FeedbackInput {
  type: "bug" | "feature" | "other";
  message: string;
  email: string;
  pageUrl: string;
  userAgent: string;
}

const FEEDBACK_TYPE_LABELS: Record<FeedbackInput["type"], string> = {
  bug: "🐞 不具合の報告",
  feature: "💡 機能の改善要望",
  other: "💬 その他",
};

/** Builds the Slack Block Kit payload for a Help-page feedback
 *  submission - sent to the operator's own admin webhook
 *  (FEEDBACK_SLACK_WEBHOOK_URL), not the submitting user's configured
 *  webhook, since this is feedback about the product itself. */
export function buildFeedbackBlocks(input: FeedbackInput) {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "📮 Zonostick フィードバック", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*種別:*\n${FEEDBACK_TYPE_LABELS[input.type]}` },
        { type: "mrkdwn", text: `*送信者:*\n${input.email}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*内容:*\n${input.message}` },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `URL: ${input.pageUrl}` },
        { type: "mrkdwn", text: `UA: ${input.userAgent}` },
      ],
    },
  ];
}

/**
 * Builds the Slack Block Kit payload for a monthly LLM-spend budget
 * warning/breach - sent to the operator's own admin webhook
 * (FEEDBACK_SLACK_WEBHOOK_URL), never a customer's, since this is
 * about the operator's own provider-account spend, not any one
 * customer's data. See lib/cost-budget.ts for the check this reports.
 *
 * Sent on EVERY daily-check run while level stays warning/critical, not
 * just once when the threshold is first crossed - deliberately: the
 * whole incident this exists to prevent (2026-09, ANTHROPIC_API_KEY
 * silently expired after the Anthropic workspace ran dry) went
 * unnoticed for 4 days precisely because nothing kept reminding anyone
 * it was still a live problem. A daily nag until it's actually
 * resolved is the intended behavior, not a bug to dedupe away.
 */
export function buildBudgetAlertBlocks(status: { budgetUsd: number; spentUsd: number; fraction: number; level: "warning" | "critical" }) {
  const pct = Math.round(status.fraction * 100);
  const headerText =
    status.level === "critical"
      ? "🔴 月間LLM予算を超過しました"
      : "🟠 月間LLM予算が閾値に近づいています";
  return [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*今月の使用額:*\n$${status.spentUsd.toFixed(2)}` },
        { type: "mrkdwn", text: `*設定予算:*\n$${status.budgetUsd.toFixed(2)} (${pct}%使用)` },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text:
            status.level === "critical"
              ? "各社の残高・利用上限も別途ご確認ください。この通知は解消するまで日次チェックのたびに届きます。"
              : "このペースが続くと予算超過の見込みです。この通知は解消するまで日次チェックのたびに届きます。",
        },
      ],
    },
  ];
}

export function buildTestMessageBlocks() {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "✅ Zonostick から Slack への接続テストに成功しました。毎朝この形式でレポートが届きます。",
      },
    },
  ];
}

/** Posts a message to a Slack Incoming Webhook URL. */
export async function sendSlackMessage(
  webhookUrl: string,
  blocks: Record<string, unknown>[],
  fallbackText: string
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: fallbackText, blocks }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

export async function sendDailySummary(
  webhookUrl: string,
  input: DailySummaryInput
): Promise<void> {
  const blocks = buildDailySummaryBlocks(input);
  const fallbackText =
    input.anomalies.length > 0
      ? `🚨 要確認 - ${input.brandName}: ${input.anomalies.length}件の変動を検知しました`
      : `✅ ステータス: 正常 - ${input.brandName} (AI露出率 ${Math.round(input.mentionRate * 100)}%)`;
  await sendSlackMessage(webhookUrl, blocks, fallbackText);
}
