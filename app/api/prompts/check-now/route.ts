import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGeoQuery } from "@/lib/geo-engine";

export const dynamic = "force-dynamic";
// One prompt across 6 providers, run in parallel (see runGeoQuery) with a
// 30s per-provider timeout - comfortably inside the 60s Hobby-plan cap.
export const maxDuration = 60;

/**
 * Runs one immediate measurement for a single, newly-created prompt so a
 * new subscriber sees real data right away instead of an empty table
 * until tomorrow's cron. Triggered fire-and-forget from PromptForm right
 * after the prompt is inserted.
 *
 * Ownership is checked via a normal (RLS-scoped) client - the prompt is
 * only readable here if it belongs to a brand the caller owns - before
 * switching to the admin client to write into `rankings`, which has no
 * authenticated-role INSERT policy (only the cron job's service role can
 * write there; see supabase/schema.sql).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const promptId = String(body.promptId ?? "");
  if (!promptId) {
    return NextResponse.json({ error: "promptId is required" }, { status: 400 });
  }

  const { data: prompt } = await supabase
    .from("prompts")
    .select("id, text, brand_id, brands(name, competitors)")
    .eq("id", promptId)
    .single();

  const brand = Array.isArray(prompt?.brands) ? prompt?.brands[0] : prompt?.brands;
  if (!prompt || !brand) {
    // Either the prompt doesn't exist, or RLS hid it because it belongs
    // to someone else's brand - both look the same from here.
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  try {
    const results = await runGeoQuery({
      prompt: prompt.text,
      brandName: brand.name,
      competitors: brand.competitors ?? [],
    });

    const checkedAt = new Date().toISOString();
    const admin = createAdminClient();
    const { error: insertError } = await admin.from("rankings").insert(
      results.map((result) => ({
        brand_id: prompt.brand_id,
        prompt_id: prompt.id,
        provider: result.provider,
        mentioned: result.mentioned,
        rank_position: result.rankPosition,
        sentiment: result.sentiment,
        competitors_mentioned: result.competitorsMentioned,
        citations: result.citations,
        raw_response: result.rawResponse || null,
        error: result.error ?? null,
        checked_at: checkedAt,
      }))
    );

    if (insertError) {
      console.error(`check-now: failed to insert rankings for prompt ${promptId}:`, insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Best-effort: if this fails, tomorrow's cron will still cover the
    // prompt normally. Never let this block the caller from continuing.
    console.error(`check-now: failed for prompt ${promptId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Check failed" },
      { status: 500 }
    );
  }
}
