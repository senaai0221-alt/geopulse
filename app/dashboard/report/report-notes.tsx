"use client";

import { useState, useTransition } from "react";
import { Loader2, Check } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/context";
import { upsertReportNotes } from "../actions";

/**
 * The "agency commentary" / "next actions" free-text boxes on the
 * report - persisted per (brand, month) so they survive regenerating
 * the report, and editable in place rather than through a separate
 * screen. On screen it's an obviously-editable bordered textarea; in
 * print/PDF the border, save button, and focus chrome all disappear
 * (print:border-0 etc.) so it reads as plain report copy, not a form
 * control that happened to get captured.
 */
export function ReportNotes({
  brandId,
  month,
  field,
  initialValue,
}: {
  brandId: string;
  month: string;
  field: "commentary" | "next_actions";
  initialValue: string;
}) {
  const { t } = useI18n();
  // report/page.tsx (the caller) is a Server Component with no useI18n()
  // access, so the placeholder is resolved here from `field` instead of
  // being passed in as a prop.
  const placeholder = t(field === "commentary" ? "report.commentaryPlaceholder" : "report.nextActionsPlaceholder");
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleBlur() {
    if (value === initialValue) return;
    setSaved(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("brand_id", brandId);
      formData.set("month", month);
      formData.set("field", field);
      formData.set("value", value);
      const result = await upsertReportNotes(formData);
      if (result.ok) setSaved(true);
    });
  }

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={4000}
        rows={4}
        className="min-h-0 resize-y text-sm print:min-h-0 print:resize-none print:rounded-none print:border-0 print:bg-transparent print:p-0 print:text-foreground"
      />
      <div className="mt-1 flex h-4 items-center gap-1 text-xs text-muted-foreground print:hidden">
        {isPending && (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> {t("report.notesSaving")}
          </>
        )}
        {!isPending && saved && (
          <>
            <Check className="h-3 w-3 text-emerald-600" /> {t("report.notesSaved")}
          </>
        )}
      </div>
    </div>
  );
}
