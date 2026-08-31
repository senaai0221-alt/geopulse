"use client";

import { useState } from "react";
import { TrendingUp, Target, PieChart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { RankTrendChart, type TrendPoint } from "@/components/rank-trend-chart";
import { ExposureTrendChart, type ExposureTrendPoint } from "@/components/exposure-trend-chart";
import { VoiceTrendChart, type VoiceTrendPoint } from "@/components/voice-trend-chart";

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
 */
export function TrendExplorer({
  rankData,
  exposureData,
  voiceData,
  voiceEntities,
}: {
  rankData: TrendPoint[];
  exposureData: ExposureTrendPoint[];
  voiceData: VoiceTrendPoint[];
  /** [brandName, ...competitorNames], stable order - see VoiceTrendChart. */
  voiceEntities: string[];
}) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<Metric>("exposure");
  const [period, setPeriod] = useState<Period>(30);

  const slicedRank = rankData.slice(-period);
  const slicedExposure = exposureData.slice(-period);
  const slicedVoice = voiceData.slice(-period);

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
      </div>

      {metric === "exposure" && <ExposureTrendChart data={slicedExposure} />}
      {metric === "rank" && <RankTrendChart data={slicedRank} />}
      {metric === "voice" && <VoiceTrendChart data={slicedVoice} entities={voiceEntities} />}
    </div>
  );
}
