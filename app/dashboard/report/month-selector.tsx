"use client";

import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";

import { Select } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/context";
import { formatMonthLabel } from "@/lib/format-month-label";

// Re-exported for existing callers of this module (this file used to
// define formatMonthLabel itself) - see lib/format-month-label.ts for
// why the real implementation had to move out of this "use client" file.
export { formatMonthLabel };

/** The last 12 months (this one first), as 'YYYY-MM' strings. Not
 *  filtered by which months actually have data - an empty month just
 *  renders the report's empty states, which is more predictable than a
 *  list that reshuffles as data arrives. */
function recentMonths(count = 12): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}


/** Leaf component for embedding the locale-formatted month label inside
 *  otherwise server-rendered report copy (report/page.tsx is a Server
 *  Component, which has no notion of the client-only JA/EN toggle) -
 *  the same pattern components/t.tsx uses for translated strings. */
export function MonthLabel({ month }: { month: string }) {
  const { locale } = useI18n();
  return <>{formatMonthLabel(month, locale)}</>;
}

export function MonthSelector({ brandId, month }: { brandId: string; month: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const months = recentMonths();
  // The currently-selected month might not be one of the last 12 (an
  // old ?month= link, or new-signup data further back than a year) -
  // keep it selectable rather than silently swapping to something else.
  const options = months.includes(month) ? months : [month, ...months];

  return (
    <div className="flex items-center gap-1.5 print:hidden">
      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        aria-label={t("report.monthSelectorLabel")}
        value={month}
        onChange={(e) => router.push(`/dashboard/report?brand=${brandId}&month=${e.target.value}`)}
        className="h-9 w-auto min-w-[9rem]"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {formatMonthLabel(m, locale)}
          </option>
        ))}
      </Select>
    </div>
  );
}
