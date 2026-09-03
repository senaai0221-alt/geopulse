/**
 * Single source of truth for how one ranking-anomaly alert reads as
 * text - used to build the `alerts.message` column (app/api/cron/
 * daily-check/route.ts), the Slack summary (lib/slack.ts), and the
 * alert email (lib/email.ts). Before this module existed, each of
 * those three built its own copy of this text independently: email.ts
 * and slack.ts each had their own verbatim-duplicated `rankLabel()`,
 * and the DB message was a third, completely separate hand-written
 * string that didn't even use the same provider display names (it
 * interpolated the raw provider slug, e.g. "claude", not "Claude"). A
 * wording or correctness fix in one place routinely missed the other
 * two - this exists so it only ever has to happen once.
 *
 * This module is also half of the fix for the 2026-09 "2位→12位" false
 * rank-drop alert incident (see lib/geo-engine.ts's buildResult and
 * extractListItems for the other half, which stops a fabricated
 * rank_position from ever being *computed* in the first place). This
 * formatter only ever prints a rank it was actually given - the fix
 * that matters is upstream, in geo-engine.ts - but `buildAnomalyMessage`
 * below still branches on `mentioned` explicitly (not just on whether
 * `currentRank` happens to be null) so a genuine disappearance reads as
 * "圏外" and never as a bare, unexplained rank number either.
 */
import type { LlmProvider } from "./geo-engine";

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

export interface RankingChange {
  brandName: string;
  promptText: string;
  provider: LlmProvider;
  previousRank: number | null;
  currentRank: number | null;
  mentioned: boolean;
  /**
   * A Latin-letter word found in the raw response that's a close-but-
   * not-exact match for the brand's mechanically-derived romaji
   * spelling (lib/romaji.ts's findRomajiNearMiss) - e.g. "docomo" found
   * for a "ドコモ" brand whose mechanical romanization is "dokomo".
   * Only ever set on a "disappeared" (critical) anomaly, and only ever
   * a *hint* for a human to double-check - never used anywhere to
   * decide `mentioned` or a rank itself (see that function's own
   * comment for why: this is deliberately fuzzy, and fuzzy judgment
   * has no business deciding facts in this codebase, only flagging
   * uncertainty about one). `null`/undefined when no such near miss
   * was found, or the brand name isn't katakana to begin with.
   */
  possibleMismatch?: string | null;
}

/**
 * Never prints a bare number unless `rank` is actually non-null - a
 * disappeared or never-ranked mention reads as "圏外" or
 * "圏内(順位なし)", never a placeholder digit standing in for "no data".
 */
export function rankLabel(rank: number | null, mentioned: boolean): string {
  if (rank !== null) return `#${rank}`;
  if (mentioned) return "圏内(順位なし)";
  return "圏外";
}

/**
 * The one-line description stored in `alerts.message` and reused as
 * the textual basis for Slack/email's own richer formatting of the
 * same event (see buildDailySummaryBlocks/buildAlertEmailHtml).
 * Branches on `mentioned` first, not just on whether `currentRank`
 * happens to be null - a mention that dropped out of a ranked list but
 * is still present in the response reads differently from one that
 * vanished outright, and the caller (app/api/cron/daily-check/route.ts)
 * only ever constructs a RankingChange for one of those two cases to
 * begin with, so this stays a plain, non-branching description rather
 * than a decision the caller has already made twice.
 */
export function buildAnomalyMessage(change: RankingChange): string {
  const provider = PROVIDER_LABELS[change.provider];
  const from = rankLabel(change.previousRank, true);
  const to = change.mentioned ? rankLabel(change.currentRank, true) : "圏外(AI回答内から消滅)";
  const base = `${change.brandName} の順位が「${change.promptText}」(${provider})で ${from} → ${to} に変動しました。`;

  // See RankingChange.possibleMismatch's own comment - this is a hint,
  // not a retraction: the alert still reports what the deterministic
  // matcher actually found, but tells the reader there's a plausible
  // reason it could be wrong before they act on it.
  if (change.possibleMismatch) {
    return `${base} ⚠️ 表記ゆれの可能性があります（原文に類似する表記「${change.possibleMismatch}」があります）。念のため原文をご確認ください。`;
  }
  return base;
}
