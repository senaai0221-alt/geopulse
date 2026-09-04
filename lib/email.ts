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

import { PROVIDER_LABELS, rankLabel, type RankingChange } from "./alert-message";
import { formatJstIntl } from "./jst";

// Exported (only) so the exact sender/body can be inspected directly by
// scripts/verify-notifications-and-exports.ts without sending a real
// email - not otherwise used outside this module.
export const FROM_ADDRESS = "Zonostick Alerts <alerts@zonostick.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.zonostick.com";

export interface AlertEmailInput {
  brandName: string;
  anomalies: RankingChange[];
  /** When this batch of checks ran - shown in the email (JST, see
   *  lib/jst.ts) so a reader can line this email up against the
   *  matching row on the dashboard instead of guessing. Optional only
   *  for scripts/verify-notifications-and-exports.ts's own inspection
   *  calls; the real send path (sendAlertEmail, called from app/api/
   *  cron/daily-check/route.ts) always provides it. */
  checkedAt?: Date;
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
      // "info" (rank became unknown, not confirmed worse) is filtered
      // out before this ever gets called - see daily-check/route.ts's
      // urgentAnomalies - but this stays severity-driven rather than
      // re-deriving from mentioned/rank shape, matching lib/slack.ts's
      // severityEmoji, so a future caller can't reintroduce an
      // undifferentiated 🟠 for a case this table was never written to
      // explain.
      const emoji = change.severity === "critical" ? "🔴" : change.severity === "warning" ? "🟠" : "🟡";
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
            ${
              // See RankingChange.possibleMismatch's own comment
              // (lib/alert-message.ts) - a hedge, not a retraction.
              change.possibleMismatch
                ? `<div style="margin-top:4px;font-weight:400;color:#b45309;white-space:normal;">⚠️ 表記ゆれの可能性（原文の「${escapeHtml(
                    change.possibleMismatch
                  )}」表記をご確認ください）</div>`
                : ""
            }
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
        ${
          input.checkedAt
            ? `<br /><span style="color:#94a3b8;font-size:12px;">計測日時: ${formatJstIntl(input.checkedAt, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })} (JST)</span>`
            : ""
        }
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

export interface PlanUsageChangeInput {
  newPlan: "pro" | "business" | "free";
  deactivatedBrands: string[];
  reactivatedBrands: string[];
  deactivatedPrompts: string[];
  reactivatedPrompts: string[];
}

const PLAN_LABELS: Record<PlanUsageChangeInput["newPlan"], string> = {
  pro: "Pro",
  business: "Business",
  free: "無料",
};

function usageListHtml(label: string, items: string[]): string {
  if (items.length === 0) return "";
  const rows = items.map((name) => `<li style="margin-bottom:4px;">${escapeHtml(name)}</li>`).join("");
  return `
    <p style="font-size:13px;font-weight:600;color:#0f172a;margin:20px 0 6px;">${label}</p>
    <ul style="margin:0;padding-left:20px;font-size:13px;color:#334155;">${rows}</ul>`;
}

/** Built by buildPlanUsageChangeEmailHtml so it can be unit-inspected
 *  without sending real mail - same pattern as buildAlertEmailHtml. */
export function buildPlanUsageChangeEmailHtml(input: PlanUsageChangeInput): string {
  const hasDeactivations = input.deactivatedBrands.length > 0 || input.deactivatedPrompts.length > 0;
  const hasReactivations = input.reactivatedBrands.length > 0 || input.reactivatedPrompts.length > 0;

  const intro = hasDeactivations
    ? `プランを${PLAN_LABELS[input.newPlan]}に変更したことに伴い、新しい上限を超えていた計測対象・プロンプトを一時停止しました。作成日が新しいものから順に停止しており、データは削除されていません。`
    : `プランを${PLAN_LABELS[input.newPlan]}にアップグレードしたことに伴い、以前一時停止されていた計測対象・プロンプトを再開しました。`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
      <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:18px;margin-bottom:20px;">
        ✨ Zonostick
      </div>
      <h1 style="font-size:18px;margin:0 0 8px;">プランの変更に伴うお知らせ</h1>
      <p style="font-size:14px;color:#475569;margin:0 0 8px;">${intro}</p>
      ${usageListHtml("⏸ 一時停止した計測対象", input.deactivatedBrands)}
      ${usageListHtml("⏸ 一時停止したプロンプト", input.deactivatedPrompts)}
      ${usageListHtml("▶ 再開した計測対象", input.reactivatedBrands)}
      ${usageListHtml("▶ 再開したプロンプト", input.reactivatedPrompts)}
      ${
        hasDeactivations
          ? `<p style="font-size:13px;color:#475569;margin:20px 0 0;">上位プランにアップグレードすると、一時停止した項目は<strong>自動的にすべて再開</strong>されます。手動での再設定は不要です。</p>`
          : ""
      }
      <a href="${APP_URL}/dashboard/settings" style="display:inline-block;margin-top:20px;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;">
        設定画面を開く
      </a>
      <p style="margin-top:28px;font-size:12px;color:#94a3b8;">
        この通知はZonostickの設定画面でオフにできます。 · zonostick.com
      </p>
    </div>`;
}

export function planUsageChangeEmailSubject(input: PlanUsageChangeInput): string {
  const hasDeactivations = input.deactivatedBrands.length > 0 || input.deactivatedPrompts.length > 0;
  return hasDeactivations
    ? "プラン変更に伴い一部の計測を一時停止しました - Zonostick"
    : "プラン変更に伴い計測を再開しました - Zonostick";
}

/** Sent from the Stripe webhook (customer.subscription.updated) whenever
 *  a plan change actually paused or resumed any brand/prompt - see
 *  lib/plan-reconciliation.ts. Silently does nothing useful to call
 *  with an all-empty input; the webhook only calls this when at least
 *  one list is non-empty. */
export async function sendPlanUsageChangeEmail(to: string, input: PlanUsageChangeInput): Promise<void> {
  await sendViaResend(to, planUsageChangeEmailSubject(input), buildPlanUsageChangeEmailHtml(input));
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
