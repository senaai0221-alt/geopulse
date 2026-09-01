"use client";

import { useState } from "react";
import { format } from "date-fns";
import { TrendingUp, Target, PieChart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { RankTrendChart, type TrendPoint } from "@/components/rank-trend-chart";
import { ExposureTrendChart, type ExposureTrendPoint } from "@/components/exposure-trend-chart";
import { VoiceTrendChart, type VoiceTrendPoint } from "@/components/voice-trend-chart";
import type { ActionMarker } from "@/components/action-markers";
import { MarketingActionDialog } from "@/app/dashboard/marketing-action-dialog";
import type { MarketingAction } from "@/lib/marketing-actions";

type Metric = "exposure" | "rank" | "voice";
const METRICS: { id: Metric; icon: typeof TrendingUp; labelKey: string }[] = [
  { id: "exposure", icon: TrendingUp, labelKey: "dashboard.trendTabExposure" },
  { id: "rank", icon: Target, labelKey: "dashboard.trendTabRank" },
  { id: "voice", icon: PieChart, labelKey: "dashboard.trendTabVoice" },
];

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

/**
 * The dashboard's trend card, upgraded from a single rank-position
 * chart into three switchable metrics (exposure rate / rank position /
 * Share of Voice) sharing one period selector. All three arrays are
 * pre-computed server-side (dashboard/page.tsx) across the full 90-day
 * window in one pass over the rankings table; switching the period here
 * just slices the tail of each array client-side - no extra fetch.
 *
 * `actions` (GEO施策メモ, real ISO action_date) rides along the same
 * period filter as the chart data - bounded by calendar days back from
 * today, not by array-slice position like the chart arrays themselves
 * (those only have an entry for a day that actually had a measurement,
 * so a plain shared slice count would silently misalign once any day
 * in the window has a gap). A logged action outside the visible window,
 * or on a day with no measurement at all for the current metric, just
 * has nothing to attach a marker to - graceful, not an error.
 */
export function TrendExplorer({
  brandId,
  rankData,
  exposureData,
  voiceData,
  voiceEntities,
  actions,
}: {
  brandId: string;
  rankData: TrendPoint[];
  exposureData: ExposureTrendPoint[];
  voiceData: VoiceTrendPoint[];
  /** [brandName, ...competitorNames], stable order - see VoiceTrendChart. */
  voiceEntities: string[];
  /** Every marketing action logged for this brand within the trend
   *  card's full lookback window (see dashboard/page.tsx) - also reused
   *  as-is for MarketingActionDialog's "recently logged" list. */
  actions: MarketingAction[];
}) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<Metric>("exposure");
  const [period, setPeriod] = useState<Period>(30);

  const slicedRank = rankData.slice(-period);
  const slicedExposure = exposureData.slice(-period);
  const slicedVoice = voiceData.slice(-period);

  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - period);
  const periodStartKey = periodStart.toISOString().slice(0, 10);
  const markers: ActionMarker[] = actions
    .filter((a) => a.action_date >= periodStartKey)
    .map((a) => ({
      date: format(new Date(a.action_date), "M/d"),
      category: t(`marketingActions.category.${a.category}`),
      title: a.title,
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetric(m.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors",
                metric === m.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <m.icon className="h-3.5 w-3.5" />
              {t(m.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <MarketingActionDialog brandId={brandId} actions={actions} />
        </div>
      </div>

      {metric === "exposure" && <ExposureTrendChart data={slicedExposure} actions={markers} />}
      {metric === "rank" && <RankTrendChart data={slicedRank} actions={markers} />}
      {metric === "voice" && <VoiceTrendChart data={slicedVoice} entities={voiceEntities} actions={markers} />}
    </div>
  );
}
