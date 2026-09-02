"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export interface ShareOfVoiceEntry {
  name: string;
  count: number;
  isBrand: boolean;
}

// Fixed categorical order for competitor bars - assigned by each
// competitor's position in the (stable, DB-ordered) `entries` prop, never
// by its sorted display position, so a competitor keeps the same color
// across renders even as day-to-day counts reshuffle the bar order. The
// tracked brand always gets the primary/indigo color instead (an
// identity signal - "this is you" - not part of this rotation), and
// these six are chosen to stay clear of the app's semantic colors
// (destructive red, success/emerald).
const COMPETITOR_COLORS = ["#f59e0b", "#0ea5e9", "#a78bfa", "#fb7185", "#14b8a6", "#94a3b8"];

/**
 * Horizontal bar comparison of how often the tracked brand vs. each known
 * competitor was mentioned across the latest measurement round. `total` is
 * the number of (prompt x provider) checks the counts are a share of.
 */
export function ShareOfVoice({
  entries,
  total,
  brandId,
}: {
  entries: ShareOfVoiceEntry[];
  total: number;
  /** Used only for the "no rivals registered yet" CTA below, to route
   *  back to this exact brand's edit form (see settings/page.tsx +
   *  brand-list-item.tsx's own `?brand=` handling) rather than a bare
   *  link to Settings that leaves the reader to find it themselves. */
  brandId: string;
}) {
  const { t } = useI18n();

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("dashboard.shareOfVoiceEmpty")}</p>
    );
  }

  // A brand with zero registered rivals only ever has itself in
  // `entries` - a lone 100% bar comparing the brand to nothing isn't a
  // "share" of anything, so this reads better as a plain nudge toward
  // the one setup step that actually makes the chart meaningful, rather
  // than a chart with a single foregone-conclusion bar.
  if (!entries.some((e) => !e.isBrand)) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">{t("dashboard.shareOfVoiceNoCompetitors")}</p>
        {/* Label already carries its own "+"/"＋" (see the ja/en
            strings) - no separate icon, so it doesn't double up. */}
        <Link
          href={`/dashboard/settings?brand=${brandId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("dashboard.shareOfVoiceAddCompetitor")}
        </Link>
      </div>
    );
  }

  const colorByName = new Map<string, string>();
  let colorIndex = 0;
  for (const entry of entries) {
    if (entry.isBrand) continue;
    colorByName.set(entry.name, COMPETITOR_COLORS[colorIndex % COMPETITOR_COLORS.length]);
    colorIndex += 1;
  }

  const sorted = [...entries].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((e) => e.count));

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((entry) => {
        const pct = Math.round((entry.count / total) * 100);
        const widthPct = (entry.count / max) * 100;
        const color = entry.isBrand ? undefined : colorByName.get(entry.name);
        return (
          <div key={entry.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", entry.isBrand && "bg-primary")}
                  style={color ? { backgroundColor: color } : undefined}
                />
                <span className={cn("truncate", entry.isBrand && "font-semibold text-foreground")}>
                  {entry.name}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", entry.isBrand && "bg-primary")}
                style={{
                  width: `${Math.max(widthPct, entry.count > 0 ? 3 : 0)}%`,
                  ...(color ? { backgroundColor: color } : undefined),
                }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        {t("dashboard.shareOfVoiceFooter", { total })}
      </p>
    </div>
  );
}
