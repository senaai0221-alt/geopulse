"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useI18n } from "@/lib/i18n/context";
import { generateReportNotes } from "../actions";
import type { ReportInsightsInput } from "@/lib/report-insights";

/**
 * Drives the AI first-draft for both report_notes fields (commentary +
 * next actions) at once - rendered exactly once on the report page
 * (near the commentary section), not once per textarea, since one
 * generation call writes both fields together from the same data.
 *
 * Fires automatically, at most once, only when `hasNotesRow` is false -
 * i.e. no report_notes row exists yet for this brand/month at all, not
 * merely "the field is currently empty". There is deliberately no
 * manual (re)generate control: once that first background draft lands,
 * the only way to change either field is to edit the textarea directly
 * (see report-notes.tsx) - a second AI pass would risk quietly
 * clobbering whatever the user has since written in its place.
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set only for the monthly-budget circuit breaker (see actions.ts's
  // generateReportNotes) - distinct from the generic `failed` state so
  // the reader sees why, rather than a plain "generation failed" that
  // reads like a transient error worth retrying.
  const [budgetExceeded, setBudgetExceeded] = useState(false);
  const autoFired = useRef(false);

  useEffect(() => {
    if (autoFired.current || hasNotesRow || !hasData) return;
    autoFired.current = true;
    setIsGenerating(true);
    generateReportNotes(brandId, month, insightsData).then((result) => {
      setIsGenerating(false);
      if (result.ok) {
        router.refresh();
      } else if (result.errorCode === "budget_exceeded") {
        setBudgetExceeded(true);
      } else {
        setFailed(true);
      }
    });
    // Only the identity of the brand/month should ever re-arm this -
    // insightsData changes on every keystroke-triggered refresh
    // elsewhere on the page and must not retrigger auto-generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, month, hasNotesRow, hasData]);

  if (!hasData || (!isGenerating && !failed && !budgetExceeded && hasNotesRow)) return null;

  return (
    <div className="flex flex-col gap-1 print:hidden">
      {isGenerating && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("report.notesGenerating")}
        </p>
      )}
      {budgetExceeded && <p className="text-xs text-destructive">{t("report.notesBudgetExceeded")}</p>}
      {failed && !budgetExceeded && <p className="text-xs text-destructive">{t("report.notesGenerateFailed")}</p>}
      {!hasNotesRow && <p className="text-xs text-muted-foreground">{t("report.notesAiDisclaimer")}</p>}
    </div>
  );
}
