"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface ShareOfVoiceRow {
  name: string;
  count: number;
  isBrand: boolean;
}

// Same palette/logic as components/share-of-voice.tsx (the dashboard's
// own snapshot bar) - colors are assigned by each competitor's stable
// position in `rows`, never by sorted rank, so a name keeps the same
// color across months instead of reshuffling; the tracked brand always
// gets the primary/indigo color as an identity signal outside the
// rotation.
const BRAND_COLOR = "#4f46e5";
const COMPETITOR_COLORS = ["#f59e0b", "#0ea5e9", "#a78bfa", "#fb7185", "#14b8a6", "#94a3b8"];

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { pct: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div className="rounded-md border border-border bg-card p-2.5 text-xs shadow-sm">
      <p className="font-medium text-foreground">{p.name}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">{p.payload.pct}%</p>
    </div>
  );
}

/**
 * Donut chart for the report's "Share of Voice" section - replaces the
 * plain percentage table with an actual visual comparison, since a
 * client-facing PDF is judged on how legible its charts are at a
 * glance, not just whether the numbers are technically present. A
 * legend list (name + exact %) is rendered alongside it rather than via
 * recharts' own Legend - both so on-screen and print styling stay
 * consistent with the rest of the app (dot + name + tabular-nums %,
 * same shape as components/share-of-voice.tsx) and so the exact figures
 * remain readable as plain text, not just chart-decoded.
 */
export function ShareOfVoiceDonut({ rows, total }: { rows: ShareOfVoiceRow[]; total: number }) {
  const { t } = useI18n();

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{t("dashboard.shareOfVoiceEmpty")}</p>;
  }

  const colorByName = new Map<string, string>();
  let colorIndex = 0;
  for (const row of rows) {
    if (row.isBrand) continue;
    colorByName.set(row.name, COMPETITOR_COLORS[colorIndex % COMPETITOR_COLORS.length]);
    colorIndex += 1;
  }

  const chartData = rows
    .filter((r) => r.count > 0)
    .map((r) => ({
      name: r.name,
      value: r.count,
      pct: Math.round((r.count / total) * 100),
      color: r.isBrand ? BRAND_COLOR : colorByName.get(r.name) ?? "#94a3b8",
    }));

  const brandRow = rows.find((r) => r.isBrand);
  const brandPct = brandRow ? Math.round((brandRow.count / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="#fff"
              strokeWidth={2}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label - the one number an exec skims for: the tracked
            brand's own share. Absolutely positioned over the donut hole
            rather than a recharts label, so its text stays crisp and
            print-safe instead of SVG-rendered. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{brandPct}%</span>
          <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
            {brandRow?.name}
          </span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        {rows.map((row) => {
          const pct = Math.round((row.count / total) * 100);
          const color = row.isBrand ? BRAND_COLOR : colorByName.get(row.name);
          return (
            <div key={row.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full")}
                  style={{ backgroundColor: color }}
                />
                <span className={cn("truncate", row.isBrand && "font-semibold text-foreground")}>
                  {row.name}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
