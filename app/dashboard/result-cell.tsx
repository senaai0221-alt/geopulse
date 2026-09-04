"use client";

import { useState } from "react";
import { FileText, X, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

/** Small Client Component leaves for one ranking-table cell: the rank
 *  badge, the sentiment dot, and the raw-response viewer modal. Split
 *  out from the (Server Component) dashboard page because each needs
 *  either translated text (useI18n) or local interactive state. */

export function RankBadge({ mentioned, rank }: { mentioned: boolean; rank: number | null }) {
  const { t } = useI18n();
  if (!mentioned) return <Badge variant="destructive">{t("dashboard.outOfRange")}</Badge>;
  if (rank === null) return <Badge variant="secondary">{t("dashboard.mentionedNoRank")}</Badge>;
  if (rank <= 3) return <Badge variant="success">#{rank}</Badge>;
  return <Badge variant="warning">#{rank}</Badge>;
}

/** Shown next to the badge when this cell's latest row has `error` set -
 *  a provider call that failed (timeout, rate limit, API error) never
 *  gets written as a real "not mentioned" (see the cron/check-now
 *  routes), so the badge itself still reads normally; this icon is the
 *  only visible sign that today's measurement didn't actually succeed
 *  and what's shown is carried forward from the last good check. */
/**
 * Warning icon shown when a check failed (a provider API error). Built
 * on Popover (see info-tooltip.tsx's own comment), not the hover-only
 * Tooltip primitive this used before (2026-09 mobile walkthrough fix) -
 * on a phone, tapping the icon fired Radix Tooltip's hover-open
 * heuristic and a near-simultaneous blur-like event closed it again
 * almost instantly, exactly the "flashes open then vanishes before you
 * can read it" bug reported from real mobile testing. Popover is
 * click/tap-toggled by design on every input type, so there's no
 * heuristic to fight - a one-line browser tooltip wouldn't have this
 * problem but also isn't enough room to explain that this is normally
 * transient and when it's actually worth worrying about, which matters
 * here specifically: a customer seeing this icon several mornings in a
 * row with no explanation reads it as "the product is broken," not "an
 * AI provider had a bad moment."
 *
 * `isFirstCheck` (2026-09 fix): the standard copy claims "表示は前回の
 * 正常な計測値のままです" (showing the last known-good value) - true for
 * a failed re-check, but false and actively confusing for a brand's
 * very first-ever measurement failing, where there IS no previous
 * value (see lib/prompt-check.ts - a failed provider with no prior row
 * just falls back to `mentioned: false`, not "carried forward"). A
 * real new subscriber hit exactly this during onboarding and asked,
 * reasonably, "it's the first time, there's no previous result" - the
 * tooltip now says so instead of asserting a history that doesn't
 * exist.
 *
 * `consecutiveFailures` (2026-09, a second fix in the same spirit as
 * the one above): the standard copy also claims this is transient and
 * "多くの場合、翌朝の自動チェックで自然に復帰します" (usually clears up
 * by tomorrow) - true for an actual one-off provider hiccup, but false
 * and quietly misleading for a genuinely broken credential/config on
 * OUR side, which won't resolve on its own no matter how many
 * "tomorrow"s pass. Found via a real walkthrough where a provider's
 * API key had been invalid for 4 straight days and every cell still
 * calmly promised an overnight fix that could never come without the
 * operator noticing and rotating the key. At 2+ consecutive failures
 * for the same (prompt, provider), the copy switches to naming this as
 * likely needing attention rather than repeating a "should clear up
 * soon" promise that has now been wrong for multiple days running.
 */
export function CheckErrorBadge({
  isFirstCheck = false,
  consecutiveFailures = 1,
}: {
  isFirstCheck?: boolean;
  /** How many checks in a row (most recent first, unbroken) have
   *  failed for this exact (prompt, provider) - including today's. 1
   *  for an isolated failure with a successful check right before it. */
  consecutiveFailures?: number;
}) {
  const { t } = useI18n();
  const tooltipKey = isFirstCheck
    ? "dashboard.checkErrorTooltipFirstCheck"
    : consecutiveFailures >= 2
      ? "dashboard.checkErrorTooltipPersistent"
      : "dashboard.checkErrorTooltip";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t(tooltipKey, { n: consecutiveFailures })}
          className="inline-flex cursor-help items-center text-amber-500 outline-none"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent>{t(tooltipKey, { n: consecutiveFailures })}</PopoverContent>
    </Popover>
  );
}

/**
 * Badge shown next to a prompt's text when a plan downgrade paused it
 * (is_active=false, see lib/plan-reconciliation.ts) - the brand list
 * already shows the same state (brand-list-item.tsx's own badge); this
 * is the ranking table's counterpart so a paused prompt doesn't just
 * silently sit there looking like every other row that's still being
 * measured every morning. Reuses the brand list's copy (both say
 * "paused because of a plan downgrade, resumes automatically on
 * upgrade") rather than a prompt-specific duplicate - the mechanism and
 * the fix are identical either way.
 *
 * Built on Popover, not Tooltip (2026-09 mobile fix, same reasoning as
 * CheckErrorBadge above and info-tooltip.tsx) - a hover-only Tooltip
 * has no real touch-device story.
 */
export function PromptPausedBadge() {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge variant="secondary" tabIndex={0} className="shrink-0 cursor-help text-[11px] outline-none">
          {t("settings.brandPaused")}
        </Badge>
      </PopoverTrigger>
      <PopoverContent>{t("settings.brandPausedHint")}</PopoverContent>
    </Popover>
  );
}

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-slate-400",
  negative: "bg-destructive",
};

export function SentimentDot({ sentiment }: { sentiment: string | null }) {
  const { t } = useI18n();
  if (!sentiment || !(sentiment in SENTIMENT_DOT)) return null;
  const label = t(
    `dashboard.sentiment${sentiment.charAt(0).toUpperCase()}${sentiment.slice(1)}` as
      | "dashboard.sentimentPositive"
      | "dashboard.sentimentNeutral"
      | "dashboard.sentimentNegative"
  );
  return (
    <span
      title={`${t("dashboard.sentimentTitle")}: ${label}`}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", SENTIMENT_DOT[sentiment])}
    />
  );
}

export function RawResponseButton({
  rawResponse,
  provider,
  promptText,
}: {
  rawResponse: string | null;
  provider: string;
  promptText: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!rawResponse) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("dashboard.viewRawResponse")}
        aria-label={t("dashboard.viewRawResponse")}
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <FileText className="h-3 w-3" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            // flex-col + max-h (not overflow-y-auto directly on this
            // outer div) so only the <pre> below scrolls - the header
            // (and its close button) stays reachable even for a very
            // long response, instead of scrolling out of view with it.
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5 pb-3">
              <div className="min-w-0">
                <h3 className="font-semibold">
                  {t("dashboard.rawResponseTitle")} · {provider}
                </h3>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{promptText}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("dashboard.close")}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="overflow-y-auto whitespace-pre-wrap break-words p-5 pt-3 text-xs leading-relaxed text-foreground">
              {rawResponse}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
