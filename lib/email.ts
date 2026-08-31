/**
 * Alert email helper - built on Resend's plain REST API (matching this
 * codebase's fetch-only, no-SDK approach - see geo-engine.ts/slack.ts)
 * rather than the @resend/node SDK. This is separate from Supabase
 * Auth's own SMTP-via-Resend setup (used only for magic-link/OTP mail);
 * this is the app sending its own transactional mail directly, which
 * needs its own RESEND_API_KEY.
 *
 * Email is the *default* notification channel (see
 * app/dashboard/settings/email-alerts-form.tsx) - Slack (lib/slack.ts)
 * is now the optional, additional one. Both fire independently from the
 * daily cron job (app/api/cron/daily-check/route.ts); one failing never
 * blocks the other.
 */

import type { LlmProvider } from "./geo-engine";
import type { RankingChange } from "./slack";

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

// Exported (only) so the exact sender/body can be inspected directly by
// scripts/verify-notifications-and-exports.ts without sending a real
// email - not otherwise used outside this module.
export const FROM_ADDRESS = "Zonostick Alerts <alerts@zonostick.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.zonostick.com";

export interface AlertEmailInput {
  brandName: string;
  anomalies: RankingChange[];
}

function rankLabel(rank: number | null, mentioned: boolean): string {
  if (rank !== null) return `#${rank}`;
  if (mentioned) return "圏内(順位なし)";
  return "圏外";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAlertEmailHtml(input: AlertEmailInput): string {
  const rows = input.anomalies
    .slice(0, 20)
    .map((change) => {
      const emoji = !change.mentioned ? "🔴" : "🟠";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">
            ${emoji} <strong>${escapeHtml(PROVIDER_LABELS[change.provider])}</strong>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">
            ${escapeHtml(change.promptText)}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;white-space:nowrap;">
            ${rankLabel(change.previousRank, true)} → <strong>${rankLabel(change.currentRank, change.mentioned)}</strong>
          </td>
        </tr>`;
    })
    .join("");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:18px;margin-bottom:20px;">
        ✨ Zonostick
      </div>
      <h1 style="font-size:18px;margin:0 0 8px;">⚠️ ${escapeHtml(input.brandName)}で重要な変動を検知しました</h1>
      <p style="font-size:14px;color:#475569;margin:0 0 20px;">
        本日のAI検索チェックで、順位の急降下または推奨リストからの除外を検知しました。詳細はダッシュボードでご確認ください。
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #cbd5e1;">LLM</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #cbd5e1;">プロンプト</th>
            <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #cbd5e1;">変動</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <a href="${APP_URL}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">
        ダッシュボードを開く
      </a>
      <p style="margin-top:28px;font-size:12px;color:#94a3b8;">
        この通知はZonostickの設定画面でオフにできます。 · zonostick.com
      </p>
    </div>`;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${body.slice(0, 500)}`);
  }
}

/** Exported alongside buildAlertEmailHtml so the exact subject line can
 *  be verified without sending a real email. */
export function alertEmailSubject(brandName: string): string {
  return `⚠️ ${brandName}で重要な変動を検知しました - Zonostick`;
}

/** Sent by the daily cron job when it detects a rank drop / disappearance
 *  for a brand whose owner has email alerts enabled (the default). */
export async function sendAlertEmail(to: string, input: AlertEmailInput): Promise<void> {
  await sendViaResend(to, alertEmailSubject(input.brandName), buildAlertEmailHtml(input));
}

/** Settings-page "send test email" button - confirms the address/API key
 *  actually work before the user relies on it. */
export async function sendTestAlertEmail(to: string): Promise<void> {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <div style="font-weight:700;font-size:18px;margin-bottom:16px;">✨ Zonostick</div>
      <p style="font-size:14px;color:#0f172a;">✅ Zonostickからのメール通知テストに成功しました。順位の急降下やAI回答からの除外を検知した際、このアドレスに自動でお知らせします。</p>
    </div>`;
  await sendViaResend(to, "Zonostick: メール通知テスト", html);
}
