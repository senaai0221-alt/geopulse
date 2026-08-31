"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useI18n } from "@/lib/i18n/context";

export interface CategoryStat {
  /** Raw category name; meaningless when `isUncategorized` (the actual
   *  "Uncategorized" label is resolved below via useI18n(), same as
   *  the detail table on page 1 - report/page.tsx is a Server
   *  Component with no useI18n() of its own). */
  category: string;
  isUncategorized: boolean;
  mentionRate: number; // 0-100
  promptCount: number;
  /** Same color this category's badge uses in the detail table on
   *  page 1 (see report/page.tsx's categoryColorMap) - one visual
   *  identity per category across the whole report, not just within
   *  this one chart. */
  color: string;
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CategoryStat & { label: string } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card p-2.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{p.label}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {p.mentionRate}% · {p.promptCount}
      </p>
    </div>
  );
}

/**
 * Horizontal bar chart for "exposure rate by category" on report page
 * 3 - replaces the old plain div/flexbox progress-bar listing. Each
 * bar's color matches that category's badge in the page-1 detail table
 * (see CategoryStat.color), so a category reads as the same visual
 * identity everywhere in the report rather than being re-colored per
 * section.
 */
export function CategoryExposureChart({ stats }: { stats: CategoryStat[] }) {
  const { t } = useI18n();

  if (stats.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.shareOfVoiceEmpty")}</p>;
  }

  const data = stats.map((s) => ({
    ...s,
    label: s.isUncategorized ? t("dashboard.uncategorized") : s.category,
  }));

  // Height scales with row count (each bar + its gap needs real room),
  // rather than a fixed box that would cram 6+ categories into
  // unreadably thin bars or leave a 1-category report mostly empty.
  const height = Math.max(120, data.length * 44);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 28, left: 8, bottom: 0 }}
          barCategoryGap={12}
        >
          <CartesianGrid horizontal={false} stroke="hsl(214 32% 91%)" strokeWidth={1} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "hsl(215 16% 47%)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fontSize: 12, fill: "hsl(222 47% 11%)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CategoryTooltip />} cursor={{ fill: "hsl(214 32% 91% / 0.4)" }} />
          <Bar dataKey="mentionRate" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {data.map((s) => (
              <Cell key={s.isUncategorized ? "__uncategorized__" : s.category} fill={s.color} />
            ))}
            <LabelList
              dataKey="mentionRate"
              position="right"
              formatter={(v: number) => `${v}%`}
              style={{ fontSize: 11, fill: "hsl(222 47% 11%)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
