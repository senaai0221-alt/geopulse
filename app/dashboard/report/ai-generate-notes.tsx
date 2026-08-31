"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { generateReportNotes } from "../actions";
import type { ReportInsightsInput } from "@/lib/report-insights";

/**
 * Drives the AI first-draft for both report_notes fields (commentary +
 * next actions) at once - rendered exactly once on the report page
 * (near the commentary section), not once per textarea, since one
 * generation call writes both fields together from the same data.
 *
 * Auto-fires on mount only when `hasNotesRow` is false - i.e. no
 * report_notes row exists yet for this brand/month at all, not merely
 * "the field is currently empty". That distinction matters: a user who
 * generated once and then deliberately cleared a field to write their
 * own text from scratch has a *row* (with a null/empty column), and
 * must never have their edit silently overwritten by another auto-run
 * on the next page load. The manual button below covers "I want a new
 * AI draft" for every other case - after that first auto-fill, it's
 * opt-in only.
 */
export function AiGenerateNotes({
  brandId,
  month,
  insightsData,
  hasNotesRow,
  hasData,
}: {
  brandId: string;
  month: string;
  insightsData: ReportInsightsInput;
  hasNotesRow: boolean;
  hasData: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const autoFired = useRef(false);

  function generate() {
    setFailed(false);
    startTransition(async () => {
      const result = await generateReportNotes(brandId, month, insightsData);
      if (result.ok) {
        router.refresh();
      } else {
        setFailed(true);
      }
    });
  }

  useEffect(() => {
    if (autoFired.current || hasNotesRow || !hasData) return;
    autoFired.current = true;
    generate();
    // Only the identity of the brand/month should ever re-arm this -
    // insightsData changes on every keystroke-triggered refresh
    // elsewhere on the page and must not retrigger auto-generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, month, hasNotesRow, hasData]);

  if (!hasData) return null;

  return (
    <div className="flex flex-col gap-1.5 print:hidden">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={generate} disabled={isPending} className="gap-1.5">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {isPending
            ? t("report.notesGenerating")
            : hasNotesRow
            ? t("report.notesRegenerateWithAi")
            : t("report.notesGenerateWithAi")}
        </Button>
      </div>
      {failed && <p className="text-xs text-destructive">{t("report.notesGenerateFailed")}</p>}
      <p className="text-xs text-muted-foreground">{t("report.notesAiDisclaimer")}</p>
    </div>
  );
}
