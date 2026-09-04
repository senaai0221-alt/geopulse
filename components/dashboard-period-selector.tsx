"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { PERIODS, useDashboardPeriod } from "@/components/dashboard-period-context";

/**
 * The global 7日/30日/90日 period toggle - moved to the top of the
 * dashboard (2026-09, operator's own UX report from a screen recording):
 * this control used to live ONLY inside TrendExplorer, the trend-graph
 * card far down the page, even though it also drives the KPI cards
 * (dashboard-kpi-cards.tsx) rendered right at the top. Changing the
 * period meant scrolling all the way down to the graph, clicking, then
 * scrolling back up to see the KPI numbers actually change - a real
 * scroll-down-click-scroll-up round trip for every single period
 * change. One shared control living at the top (both the KPI cards AND
 * the graph read the same DashboardPeriodProvider Context either way,
 * so this is purely a relocation, not a new state) removes that trip
 * entirely - every consumer on the page updates the instant it's
 * clicked, with nothing further down needed to see it take effect.
 */
export function DashboardPeriodSelector() {
  const { t } = useI18n();
  const { period, setPeriod } = useDashboardPeriod();

  return (
    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPeriod(p)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            period === p
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("dashboard.trendPeriodDays", { n: p })}
        </button>
      ))}
    </div>
  );
}
