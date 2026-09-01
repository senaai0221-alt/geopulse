"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useI18n } from "@/lib/i18n/context";

export type ExposureTrendPoint = {
  date: string;
  /** 0-100, or null for a day with no checks at all (kept as a gap in
   *  the line rather than a false dip to 0). */
  exposureRate: number | null;
};

function ExposureTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number | null }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || payload[0].value === null) return null;
  return (
    <div className="rounded-md border border-border bg-card p-2.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-1 tabular-nums text-muted-foreground">{payload[0].value}%</p>
    </div>
  );
}

/** AI exposure rate (% of checks that mentioned the brand) over time -
 *  a single line, since there's only one entity (the tracked brand) in
 *  this metric, unlike the per-provider rank chart or the per-
 *  competitor voice chart. */
export function ExposureTrendChart({ data }: { data: ExposureTrendPoint[] }) {
  const { t } = useI18n();

  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.trendNeedsMoreData")}</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(214 32% 91%)" strokeWidth={1} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "hsl(215 16% 47%)" }}
            axisLine={{ stroke: "hsl(214 32% 91%)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: "hsl(215 16% 47%)" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<ExposureTooltip />} />
          <Line
            type="monotone"
            dataKey="exposureRate"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
