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

export function RankTrendChart({ data }: { data: TrendPoint[] }) {
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
            reversed
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
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
