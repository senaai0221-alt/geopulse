"use client";

import { createContext, useContext, useState } from "react";

/**
 * Shared "which period is selected" state for the dashboard's KPI
 * cards (components/dashboard-kpi-cards.tsx) and trend graph
 * (components/trend-explorer.tsx) - added because "AI露出率" (and
 * avg. position) previously had no stated time window at all: the KPI
 * cards showed a plain snapshot of the single latest measurement per
 * prompt/provider, with no way to tell whether a viewer was looking at
 * "today," "since I signed up," or anything in between (2026-09,
 * flagged by the operator: 数字を長い期間で均してしまうのは良くない、
 * 選択できるような形にした方がいい).
 *
 * A React Context instead of lifting this into a single parent
 * component because the KPI cards and the trend graph are rendered in
 * two different places on the dashboard page (a KPI row near the top,
 * the graph much further down, with an unrelated ranking table in
 * between) - Context lets both read/write the same period without
 * forcing everything between them into one component too.
 */
export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

// 7 days, not the trend graph's old default of 30: short enough that
// "AI露出率" reflects recent reality (an operator who just fixed
// something wants to see that improvement show up quickly, not have it
// diluted across a month of history) while still smoothing out a
// single bad/lucky day's noise - see the operator's own reasoning
// above.
const DEFAULT_PERIOD: Period = 7;

interface PeriodContextValue {
  period: Period;
  setPeriod: (period: Period) => void;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

export function DashboardPeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  return <PeriodContext.Provider value={{ period, setPeriod }}>{children}</PeriodContext.Provider>;
}

export function useDashboardPeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    throw new Error("useDashboardPeriod must be used within a DashboardPeriodProvider");
  }
  return ctx;
}
