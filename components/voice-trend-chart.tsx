"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useI18n } from "@/lib/i18n/context";

export type VoiceTrendPoint = { date: string } & Record<string, number | null>;

// Same palette as components/share-of-voice.tsx, for the same reason:
// fixed order (by stable entity position, not sorted rank) so a
// competitor keeps its color across renders, and the brand itself
// always gets the primary/indigo color as an identity signal outside
// this rotation.
const COMPETITOR_COLORS = ["#f59e0b", "#0ea5e9", "#a78bfa", "#fb7185", "#14b8a6", "#94a3b8"];
const BRAND_COLOR = "#4f46e5";

function VoiceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number | null; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const present = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (present.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-2.5 text-xs shadow-sm">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      <div className="flex flex-col gap-1">
        {present.map((p) => (
          <div key={p.dataKey} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="max-w-[10rem] truncate text-muted-foreground">{p.dataKey}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{p.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Share of Voice - the brand vs. each known competitor - as a trend
 *  over time, rather than components/share-of-voice.tsx's single-
 *  snapshot bar comparison. `entities` is [brandName, ...competitorNames]
 *  in stable (never re-sorted) order, used both to pick each line's
 *  color and to know which keys in `data` to plot. */
export function VoiceTrendChart({ data, entities }: { data: VoiceTrendPoint[]; entities: string[] }) {
  const { t } = useI18n();

  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.trendNeedsMoreData")}</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
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
          <Tooltip content={<VoiceTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: "hsl(215 16% 47%)" }} />
          {entities.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              name={name}
              stroke={i === 0 ? BRAND_COLOR : COMPETITOR_COLORS[(i - 1) % COMPETITOR_COLORS.length]}
              strokeWidth={i === 0 ? 2.5 : 2}
              dot={{ r: 3.5, strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
