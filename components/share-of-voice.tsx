import { cn } from "@/lib/utils";

export interface ShareOfVoiceEntry {
  name: string;
  count: number;
  isBrand: boolean;
}

/**
 * Horizontal bar comparison of how often the tracked brand vs. each known
 * competitor was mentioned across the latest measurement round. `total` is
 * the number of (prompt x provider) checks the counts are a share of.
 */
export function ShareOfVoice({ entries, total }: { entries: ShareOfVoiceEntry[]; total: number }) {
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        まだ計測結果がありません。プロンプトを追加すると表示されます。
      </p>
    );
  }

  const sorted = [...entries].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...sorted.map((e) => e.count));

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((entry) => {
        const pct = Math.round((entry.count / total) * 100);
        const widthPct = (entry.count / max) * 100;
        return (
          <div key={entry.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className={cn("truncate", entry.isBrand && "font-semibold text-foreground")}>
                {entry.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  entry.isBrand ? "bg-primary" : "bg-slate-400"
                )}
                style={{ width: `${Math.max(widthPct, entry.count > 0 ? 3 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        直近の計測(全{total}件のプロンプト×LLM回答)における言及割合
      </p>
    </div>
  );
}
