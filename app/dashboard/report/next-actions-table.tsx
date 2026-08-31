"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, Pencil, Eye } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { parseMarkdownTable } from "@/lib/parse-markdown-table";
import { upsertReportNotes } from "../actions";

const PRIORITY_KEYWORDS: Record<"high" | "medium" | "low", string[]> = {
  high: ["高", "high"],
  medium: ["中", "med"],
  low: ["低", "low"],
};

function priorityLevel(value: string): "high" | "medium" | "low" | null {
  const normalized = value.trim().toLowerCase();
  for (const [level, keywords] of Object.entries(PRIORITY_KEYWORDS) as [
    "high" | "medium" | "low",
    string[]
  ][]) {
    if (keywords.some((k) => normalized.includes(k))) return level;
  }
  return null;
}

const PRIORITY_BADGE_VARIANT: Record<"high" | "medium" | "low", "destructive" | "warning" | "secondary"> = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

/** Renders one table cell - the priority column gets a colored Badge
 *  instead of plain text, every other column stays plain (a table of
 *  all-badges reads noisier, not more "consulting-grade"). */
function Cell({ header, value }: { header: string; value: string }) {
  const isPriorityColumn = /優先度|priority/i.test(header);
  const level = isPriorityColumn ? priorityLevel(value) : null;
  if (level) {
    return (
      <Badge variant={PRIORITY_BADGE_VARIANT[level]} className="whitespace-nowrap">
        {value}
      </Badge>
    );
  }
  return <span>{value}</span>;
}

/**
 * The "next month's recommended actions" field - unlike commentary
 * (plain paragraph text, see report-notes.tsx), this one is meant to
 * be a 5W1H-style action table (action / purpose / priority / owner),
 * so it gets its own renderer: a real, print-ready <table> with a
 * colored priority badge, backed by the exact same raw-text storage
 * and save action as every other report_notes field - the underlying
 * value is a GFM Markdown table (see lib/parse-markdown-table.ts), and
 * "editing" just means editing that Markdown directly, the same
 * philosophy as the rest of this report's free-text fields (no rich
 * table editor, no drag-to-reorder - a textarea the user already knows
 * how to use).
 *
 * Screen: table view by default when the content actually parses as a
 * table, with a small "Edit" toggle to raw Markdown; falls back to a
 * plain textarea (like report-notes.tsx) when it doesn't parse yet -
 * empty, still the placeholder, or pre-existing free text from before
 * this format existed. Print: only ever the rendered table (or the
 * plain paragraph text as a fallback) - the edit toggle and textarea
 * chrome never appear in the PDF.
 */
export function NextActionsTable({
  brandId,
  month,
  initialValue,
}: {
  brandId: string;
  month: string;
  initialValue: string;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const parsed = parseMarkdownTable(value);
  const [isEditing, setIsEditing] = useState(!parsed);

  function handleBlur() {
    if (value === initialValue) return;
    setSaved(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("brand_id", brandId);
      formData.set("month", month);
      formData.set("field", "next_actions");
      formData.set("value", value);
      const result = await upsertReportNotes(formData);
      if (result.ok) setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {parsed && !isEditing && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                {parsed.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      <Cell header={parsed.headers[j] ?? ""} value={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(!parsed || isEditing) && (
        <Textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          onBlur={handleBlur}
          placeholder={t("report.nextActionsPlaceholder")}
          maxLength={4000}
          rows={6}
          className="min-h-0 resize-y font-mono text-xs print:min-h-0 print:resize-none print:rounded-none print:border-0 print:bg-transparent print:p-0 print:text-foreground"
        />
      )}

      <div className="flex items-center gap-3 print:hidden">
        {parsed && (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing((v) => !v)} className="gap-1.5">
            {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {isEditing ? t("report.previewTable") : t("report.editRawTable")}
          </Button>
        )}
        <div className="flex h-4 items-center gap-1 text-xs text-muted-foreground">
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
    </div>
  );
}
