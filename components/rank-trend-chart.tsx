"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { LlmProvider } from "@/lib/geo-engine";
import { useI18n } from "@/lib/i18n/context";
import { renderActionMarkers, type ActionMarker } from "@/components/action-markers";

export type TrendPoint = {
  date: string;
} & Record<LlmProvider, number | null>;

// Fixed categorical order - never cycled, never re-derived from data so a
// provider's color stays stable across renders and filters.
const PROVIDER_ORDER: LlmProvider[] = [
  "chatgpt",
  "claude",
  "perplexity",
  "gemini",
  "grok",
  "deepseek",
];

const PROVIDER_COLOR: Record<LlmProvider, string> = {
  chatgpt: "#2a78d6",
  claude: "#eb6834",
  perplexity: "#1baf7a",
  gemini: "#eda100",
  grok: "#e87ba4",
  deepseek: "#008300",
};

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
};

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: LlmProvider; value: number | null; color: string }[];
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
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted-foreground">{PROVIDER_LABEL[p.dataKey]}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              #{p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RankTrendChart({ data, actions = [] }: { data: TrendPoint[]; actions?: ActionMarker[] }) {
  const { t } = useI18n();

  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.trendNeedsMoreData")}</p>;
  }

  // A day only enters `data` at all once it has at least one measurement
  // (see dashboard/page.tsx's dayBuckets loop) - but a brand whose
  // responses are only ever prose (never a numbered/ranked list) has
  // `rank_position: null` on every single row, every day, for every
  // provider. That's a real, valid state (not a bug), but rendering it
  // as bare axes with no line and no explanation reads exactly like the
  // "掲載順位データが反映されない" report - so it gets its own message
  // instead of a silently empty plot.
  const hasAnyRank = data.some((point) => PROVIDER_ORDER.some((p) => point[p] !== null && point[p] !== undefined));
  if (!hasAnyRank) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.trendNoRankData")}</p>;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(214 32% 91%)" strokeWidth={1} />
          {renderActionMarkers(actions)}
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "hsl(215 16% 47%)" }}
            axisLine={{ stroke: "hsl(214 32% 91%)" }}
            tickLine={false}
          />
          <YAxis
            reversed
            // #1 is always the top of the axis and the scale never
            // shrinks past a real rank value, regardless of which
            // providers/days happen to be in the currently sliced
            // (7/30/90-day) window - an auto-computed domain could
            // otherwise land on a "nice" bound like 0 (see the stray
            // 0 tick this replaces) that no real rank_position value
            // ever takes.
            domain={[1, "dataMax"]}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(215 16% 47%)" }}
            axisLine={false}
            tickLine={false}
            width={28}
            label={{
              value: t("dashboard.positionAxisLabel"),
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "hsl(215 16% 47%)" },
            }}
          />
          <Tooltip content={<TrendTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "hsl(215 16% 47%)" }}
            formatter={(value: string) => PROVIDER_LABEL[value as LlmProvider] ?? value}
          />
          {PROVIDER_ORDER.map((provider) => (
            <Line
              key={provider}
              type="monotone"
              dataKey={provider}
              name={provider}
              stroke={PROVIDER_COLOR[provider]}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              connectNulls
              // The rank/exposure/voice tabs are mutually exclusive
              // (see TrendExplorer) - each mounts fresh, from zero,
              // every time a viewer switches to it, which restarts
              // Recharts' default ~1.5s entry-draw animation from an
              // empty line on every single switch. A viewer who
              // clicks "掲載順位" and looks (the whole point of
              // clicking a tab) lands mid-animation and sees exactly
              // "no data plotted" for up to that long, even though
              // the data was there the entire time - this is the
              // reported bug's actual mechanism, not a data or axis
              // problem. Disabling the animation makes every tab
              // render its full line immediately on mount.
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
