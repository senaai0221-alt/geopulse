import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/geo-engine";
import { PROVIDER_LABELS, SENTIMENT_LABELS, csvRow, CSV_BOM } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

/**
 * Exports the current dashboard data for one brand as a CSV file - the
 * per-prompt/per-provider latest results, plus a share-of-voice summary
 * against known competitors. Intended for pasting into a client report
 * or spreadsheet.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brandId = request.nextUrl.searchParams.get("brand");
  if (!brandId) {
    return NextResponse.json({ error: "brand is required" }, { status: 400 });
  }

  // RLS (brands_crud_own) means this returns nothing if the brand isn't
  // the caller's own - same 404 either way, so ownership isn't leaked.
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, competitors")
    .eq("id", brandId)
    .single();
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const [{ data: prompts }, { data: recentRankings }] = await Promise.all([
    supabase
      .from("prompts")
      .select("id, text")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: true }),
    supabase
      .from("rankings")
      .select("prompt_id, provider, mentioned, rank_position, sentiment, competitors_mentioned, checked_at")
      .eq("brand_id", brandId)
      .order("checked_at", { ascending: false })
      .limit(2000),
  ]);

  interface RankingRecord {
    prompt_id: string;
    provider: LlmProvider;
    mentioned: boolean;
    rank_position: number | null;
    sentiment: string | null;
    competitors_mentioned: string[];
    checked_at: string;
  }
  const allRankings = (recentRankings ?? []) as RankingRecord[];

  const latestByKey = new Map<string, RankingRecord>();
  for (const r of allRankings) {
    const key = `${r.prompt_id}-${r.provider}`;
    if (!latestByKey.has(key)) latestByKey.set(key, r);
  }
  const latestList = Array.from(latestByKey.values());

  const mentionedCount = latestList.filter((r) => r.mentioned).length;
  const mentionRate = latestList.length > 0 ? Math.round((mentionedCount / latestList.length) * 100) : 0;

  let csv = CSV_BOM; // UTF-8 BOM so Excel (incl. Japanese locales) reads this as UTF-8, not Shift-JIS.

  csv += `Zonostick レポート - ${brand.name}\r\n`;
  csv += `出力日時,${new Date().toLocaleString("ja-JP")}\r\n`;
  csv += `言及率,${mentionRate}%\r\n`;
  csv += "\r\n";

  csv += "■ プロンプト × LLM別 最新結果\r\n";
  csv += csvRow(["プロンプト", "LLM", "言及", "推奨順位", "論調", "計測日時"]);
  for (const prompt of prompts ?? []) {
    for (const provider of LLM_PROVIDERS) {
      const r = latestByKey.get(`${prompt.id}-${provider}`);
      if (!r) {
        csv += csvRow([prompt.text, PROVIDER_LABELS[provider], "未計測", "", "", ""]);
        continue;
      }
      csv += csvRow([
        prompt.text,
        PROVIDER_LABELS[provider],
        r.mentioned ? "あり" : "なし",
        r.rank_position ?? "",
        r.sentiment ? SENTIMENT_LABELS[r.sentiment] ?? r.sentiment : "",
        new Date(r.checked_at).toLocaleString("ja-JP"),
      ]);
    }
  }

  csv += "\r\n";
  csv += "■ 競合との言及シェア(直近の計測結果ベース)\r\n";
  csv += csvRow(["名前", "言及回数", "シェア"]);
  const total = latestList.length || 1;
  const shareRows: { name: string; count: number }[] = [
    { name: brand.name, count: mentionedCount },
    ...(brand.competitors ?? []).map((name: string) => ({
      name,
      count: latestList.filter((r) => r.competitors_mentioned?.includes(name)).length,
    })),
  ];
  for (const row of shareRows) {
    csv += csvRow([row.name, row.count, `${Math.round((row.count / total) * 100)}%`]);
  }

  const filename = `zonostick_${brand.name}_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
