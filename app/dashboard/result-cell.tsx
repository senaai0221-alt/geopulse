"use client";

import { useState } from "react";
import { FileText, X, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
 * Warning icon shown when a check failed (a provider API error) and
 * the cell is carrying forward the last known-good value instead of a
 * false "圏外" (see app/api/cron/daily-check/route.ts). Uses the same
 * rich Tooltip as InfoTooltip rather than a native `title` attribute -
 * a one-line browser tooltip isn't enough room to explain that this is
 * normally transient and when it's actually worth worrying about,
 * which matters here specifically: a customer seeing this icon several
 * mornings in a row with no explanation reads it as "the product is
 * broken," not "an AI provider had a bad moment."
 */
export function CheckErrorBadge() {
  const { t } = useI18n();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-help items-center text-amber-500 outline-none">
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("dashboard.checkErrorTooltip")}</TooltipContent>
    </Tooltip>
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
