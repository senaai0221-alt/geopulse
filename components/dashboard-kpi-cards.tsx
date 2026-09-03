"use client";

import { Megaphone, TrendingUp, Target, Bell } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/t";
import { InfoTooltip } from "@/components/info-tooltip";
import { useI18n } from "@/lib/i18n/context";
import { useDashboardPeriod } from "@/components/dashboard-period-context";

/** One JST calendar day's raw totals - summable across an arbitrary
 *  tail slice (see below), unlike the trend graph's own per-day
 *  ratio/average arrays which have already collapsed each day down to
 *  a single displayable number. */
export interface DailyStatsPoint {
  /** JST calendar-day key (yyyy-MM-dd) - matches dashboard/page.tsx's
   *  own day-bucketing, not the "M/d" display string the trend charts
   *  use, so this stays sortable/comparable regardless of locale. */
  date: string;
  mentioned: number;
  total: number;
  rankSum: number;
  rankCount: number;
}

export interface DailyAlertPoint {
  date: string;
  count: number;
}

/**
 * The dashboard's top KPI row (AI露出率 / 平均掲載ポジション / アラート)
 * plus the zero-mention warning card above it - both scoped to the
 * SAME selectable period (see dashboard-period-context.tsx) the trend
 * graph further down the page uses, instead of the plain snapshot of
 * the single latest measurement per prompt/provider this used to be,
 * with no stated time window at all (2026-09, flagged by the operator:
 * "AI露出率...いつからいつまでの露出率の話になるのか...期間の明言を
 * しないと...数字を長い期間で均してしまうのは良くない").
 *
 * `dailyStats`/`dailyAlerts` are the full up-to-90-day daily series
 * (dashboard/page.tsx - one pass over the same rankings/alerts rows
 * the trend graph already computes from) - slicing the tail here
 * client-side on period change, exactly like TrendExplorer already
 * does for its own charts, so switching periods never needs another
 * fetch and always shows the identical window the graph is showing.
 */
export function DashboardKpiCards({
  dailyStats,
  dailyAlerts,
}: {
  dailyStats: DailyStatsPoint[];
  dailyAlerts: DailyAlertPoint[];
}) {
  const { t } = useI18n();
  const { period } = useDashboardPeriod();

  const slicedStats = dailyStats.slice(-period);
  const totalChecks = slicedStats.reduce((sum, d) => sum + d.total, 0);
  const totalMentioned = slicedStats.reduce((sum, d) => sum + d.mentioned, 0);
  const mentionRate = totalChecks > 0 ? totalMentioned / totalChecks : 0;

  const rankSum = slicedStats.reduce((sum, d) => sum + d.rankSum, 0);
  const rankCount = slicedStats.reduce((sum, d) => sum + d.rankCount, 0);
  const avgRank = rankCount > 0 ? rankSum / rankCount : null;

  const alertCount = dailyAlerts.slice(-period).reduce((sum, d) => sum + d.count, 0);

  return (
    <>
      {/* Zero-mention warning: churn-risk empty state for the selected
          period, not just a blank chart - re-evaluated on every period
          change rather than fixed to "the latest check," so switching
          to a longer window can turn a scary "0%" into "ok, it was
          just today" or vice versa. */}
      {totalChecks > 0 && mentionRate === 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <CardTitle className="text-destructive">
                <T k="dashboard.zeroMentionTitle" />
              </CardTitle>
              <CardDescription className="mt-1 text-foreground/80">
                <T k="dashboard.zeroMentionDesc" vars={{ n: period }} />
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="ml-1 flex list-disc flex-col gap-1.5 pl-4 text-sm text-foreground/80">
              <li>
                <T k="dashboard.zeroMentionTip1" />
              </li>
              <li>
                <T k="dashboard.zeroMentionTip2" />
              </li>
              <li>
                <T k="dashboard.zeroMentionTip3" />
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* KPI cards - top row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <T k="dashboard.mentionRate" />
              <InfoTooltip textKey="dashboard.mentionRateTooltip" />
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(mentionRate * 100)}%</div>
            <p className="text-xs text-muted-foreground">{t("dashboard.mentionRateHint", { n: period })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <T k="dashboard.avgRank" />
              <InfoTooltip textKey="dashboard.avgRankTooltip" />
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgRank !== null ? avgRank.toFixed(1) : "-"}</div>
            <p className="text-xs text-muted-foreground">{t("dashboard.avgRankHint", { n: period })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <T k="dashboard.alertsThisWeek" />
              <InfoTooltip textKey="dashboard.alertsThisWeekTooltip" />
            </CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertCount}</div>
            <p className="text-xs text-muted-foreground">{t("dashboard.alertsThisWeekHint", { n: period })}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
