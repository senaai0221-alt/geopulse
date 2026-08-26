/**
 * Slack notification helpers - builds Block Kit payloads and posts them
 * to an Incoming Webhook URL. Used by the daily cron job to send a
 * per-user summary plus any detected ranking anomalies.
 */

import type { LlmProvider } from "./geo-engine";

export interface RankingChange {
  brandName: string;
  promptText: string;
  provider: LlmProvider;
  previousRank: number | null;
  currentRank: number | null;
  mentioned: boolean;
}

export interface DailySummaryInput {
  brandName: string;
  checkedAt: Date;
  totalPrompts: number;
  totalChecks: number;
  mentionRate: number; // 0-1
  anomalies: RankingChange[];
}

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

function rankLabel(rank: number | null, mentioned: boolean): string {
  if (rank !== null) return `#${rank}`;
  if (mentioned) return "圏内(順位なし)";
  return "圏外";
}

function severityEmoji(change: RankingChange): string {
  if (!change.mentioned) return "🔴";
  if (
    change.previousRank !== null &&
    change.currentRank !== null &&
    change.currentRank > change.previousRank
  ) {
    return "🟠";
  }
  return "🟡";
}

/** Builds the Slack Block Kit payload for the daily summary + anomalies. */
export function buildDailySummaryBlocks(input: DailySummaryInput) {
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(input.checkedAt);

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 GEOPulse 日次レポート - ${input.brandName}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `${dateLabel} の計測結果` }],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*計測プロンプト数:*\n${input.totalPrompts}` },
        { type: "mrkdwn", text: `*総チェック数:*\n${input.totalChecks}` },
        {
          type: "mrkdwn",
          text: `*言及率:*\n${Math.round(input.mentionRate * 100)}%`,
        },
        { type: "mrkdwn", text: `*検知された異常:*\n${input.anomalies.length}件` },
      ],
    },
  ];

  if (input.anomalies.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "✅ 順位の異常な変動は検出されませんでした。" },
    });
  } else {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*⚠️ 検知された変動:*" },
    });

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
            )}*`,
        },
      });
    }
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "GEOPulse - AI検索順位トラッカー" }],
  });

  return blocks;
}

export function buildTestMessageBlocks() {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "✅ GEOPulse から Slack への接続テストに成功しました。毎朝この形式でレポートが届きます。",
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
  await sendSlackMessage(
    webhookUrl,
    blocks,
    `GEOPulse 日次レポート: ${input.brandName} - 異常${input.anomalies.length}件`
  );
}
