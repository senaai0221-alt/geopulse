"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { LlmProvider } from "@/lib/geo-engine";
import { useI18n } from "@/lib/i18n/context";

export interface ProviderStat {
  provider: LlmProvider;
  mentionRate: number; // 0-100
  avgRank: number | null;
}

// Same brand-accurate palette as components/rank-trend-chart.tsx, reused
// here so a given LLM reads as the same color everywhere in the app -
// the dashboard's trend chart, this report, anywhere else it shows up.
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

function ExposureTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { provider: LlmProvider; mentionRate: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card p-2.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{PROVIDER_LABEL[p.provider]}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">{p.mentionRate}%</p>
    </div>
  );
}

function RankTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { provider: LlmProvider; avgRank: number | null } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  if (p.avgRank === null) return null;
  return (
    <div className="rounded-md border border-border bg-card p-2.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{PROVIDER_LABEL[p.provider]}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">#{p.avgRank.toFixed(1)}</p>
    </div>
  );
}

/**
 * Two stacked bar charts comparing all 6 LLMs on the report's page 2 -
 * exposure rate and average rank, each on its own chart rather than one
 * dual-axis chart. Exposure (0-100%) and rank position (1 = best, no
 * fixed ceiling) are different-scale measures with opposite "better"
 * directions; forcing them onto one chart (or a single radar, where
 * both would share one radial scale) reads as a comparison that isn't
 * actually apples-to-apples. Two clearly-captioned charts stay
 * unambiguous on both screen and a printed page.
 */
export function LlmComparisonChart({ stats }: { stats: ProviderStat[] }) {
  const { t } = useI18n();

  const rankStats = stats.filter((s) => s.avgRank !== null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("dashboard.mentionRate")}</p>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(214 32% 91%)" strokeWidth={1} />
              <XAxis
                dataKey="provider"
                tickFormatter={(v: LlmProvider) => PROVIDER_LABEL[v]}
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
              <Tooltip content={<ExposureTooltip />} cursor={{ fill: "hsl(214 32% 91% / 0.4)" }} />
              <Bar dataKey="mentionRate" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {stats.map((s) => (
                  <Cell key={s.provider} fill={PROVIDER_COLOR[s.provider]} />
                ))}
                <LabelList
                  dataKey="mentionRate"
                  position="top"
                  formatter={(v: number) => `${v}%`}
                  style={{ fontSize: 11, fill: "hsl(222 47% 11%)" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-xs font-medium text-muted-foreground">{t("dashboard.avgRank")}</p>
          <p className="text-[10px] text-muted-foreground">{t("report.rankLowerIsBetterHint")}</p>
        </div>
        {rankStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.shareOfVoiceEmpty")}</p>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankStats} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(214 32% 91%)" strokeWidth={1} />
                <XAxis
                  dataKey="provider"
                  tickFormatter={(v: LlmProvider) => PROVIDER_LABEL[v]}
                  tick={{ fontSize: 11, fill: "hsl(215 16% 47%)" }}
                  axisLine={{ stroke: "hsl(214 32% 91%)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(215 16% 47%)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip content={<RankTooltip />} cursor={{ fill: "hsl(214 32% 91% / 0.4)" }} />
                <Bar dataKey="avgRank" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {rankStats.map((s) => (
                    <Cell key={s.provider} fill={PROVIDER_COLOR[s.provider]} />
                  ))}
                  <LabelList
                    dataKey="avgRank"
                    position="top"
                    formatter={(v: number) => `#${v.toFixed(1)}`}
                    style={{ fontSize: 11, fill: "hsl(222 47% 11%)" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
