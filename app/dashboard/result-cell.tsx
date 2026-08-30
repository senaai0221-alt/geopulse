"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
