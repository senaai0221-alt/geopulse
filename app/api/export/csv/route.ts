import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { LlmProvider } from "@/lib/geo-engine";
import {
  PROVIDER_LABELS,
  SENTIMENT_LABELS,
  FLAT_CSV_HEADERS,
  csvRow,
  CSV_BOM,
  extractMentionSnippet,
} from "@/lib/csv-export";

export const dynamic = "force-dynamic";

// Hard ceiling on rows in one export, independent of the date range - a
// long-running account (many prompts x 6 providers x a wide window)
// could otherwise build a request heavy enough to strain both this
// route and whatever spreadsheet tool has to open the result.
const MAX_ROWS = 20000;
const DEFAULT_RANGE_DAYS = 90;

/**
 * Exports every measurement event for one brand as a flat CSV - one row
 * per (prompt, provider, check), not the old two-section human-readable
 * summary. Built for pasting straight into Excel/Looker Studio/Sheets
 * for pivoting, not for reading top-to-bottom, so there's no "still
 * unmeasured" placeholder row the way the dashboard table has one -
 * this is a log of what actually happened, not the current matrix of
 * every (prompt, provider) pair.
 *
 * Pro/Business only (see LLM_PROVIDERS use throughout the app for the
 * plan tiers) - the per-event history, raw-response snippets, and
 * citation URLs here are the paid tier's own differentiator, not the
 * lighter export a free account would get if this app still had a free
 * tier at all.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  if (profile?.plan !== "pro" && profile?.plan !== "business") {
    return NextResponse.json({ error: "csv_export_requires_paid_plan" }, { status: 403 });
  }

  const brandId = request.nextUrl.searchParams.get("brand");
  if (!brandId) {
    return NextResponse.json({ error: "brand is required" }, { status: 400 });
  }

  // RLS (brands_crud_own) means this returns nothing if the brand isn't
  // the caller's own - same 404 either way, so ownership isn't leaked.
  const { data: brand } = await supabase.from("brands").select("id, name").eq("id", brandId).single();
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  // ?from=YYYY-MM-DD&to=YYYY-MM-DD, defaulting to the last 90 days - an
  // unbounded "everything" export on a long-running account could
  // easily be tens of thousands of rows (10 prompts x 6 providers x a
  // year+ of daily checks).
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const to = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? new Date(`${toParam}T23:59:59`) : new Date();
  const from =
    fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
      ? new Date(`${fromParam}T00:00:00`)
      : new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  const [{ data: prompts }, { data: rankings }] = await Promise.all([
    supabase.from("prompts").select("id, text, category").eq("brand_id", brandId),
    supabase
      .from("rankings")
      .select("prompt_id, provider, mentioned, rank_position, sentiment, raw_response, citations, checked_at")
      .eq("brand_id", brandId)
      .gte("checked_at", from.toISOString())
      .lte("checked_at", to.toISOString())
      .order("checked_at", { ascending: false })
      .limit(MAX_ROWS),
  ]);

  interface RankingRecord {
    prompt_id: string;
    provider: LlmProvider;
    mentioned: boolean;
    rank_position: number | null;
    sentiment: string | null;
    raw_response: string | null;
    citations: string[];
    checked_at: string;
  }
  interface PromptRecord {
    id: string;
    text: string;
    category: string | null;
  }

  const promptById = new Map(((prompts ?? []) as PromptRecord[]).map((p) => [p.id, p]));

  let csv = CSV_BOM; // UTF-8 BOM so Excel (incl. Japanese locales) reads this as UTF-8, not Shift-JIS.
  csv += csvRow(FLAT_CSV_HEADERS);

  for (const r of (rankings ?? []) as RankingRecord[]) {
    const prompt = promptById.get(r.prompt_id);
    csv += csvRow([
      new Date(r.checked_at).toLocaleString("ja-JP"),
      brand.name,
      prompt?.text ?? "",
      prompt?.category ?? "",
      PROVIDER_LABELS[r.provider] ?? r.provider,
      r.mentioned ? 1 : 0,
      r.rank_position ?? "",
      r.sentiment ? SENTIMENT_LABELS[r.sentiment] ?? r.sentiment : "",
      r.mentioned ? extractMentionSnippet(r.raw_response, brand.name) : "",
      (r.citations ?? []).join("; "),
    ]);
  }

  const filename = `zonostick_${brand.name}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
