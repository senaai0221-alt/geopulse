import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGeoQuery } from "@/lib/geo-engine";

export const dynamic = "force-dynamic";
// One prompt across 6 providers, run in parallel (see runGeoQuery) with a
// 30s per-provider timeout - comfortably inside the 60s Hobby-plan cap.
export const maxDuration = 60;

// Each call fans out to 6 paid LLM APIs, so this is rate-limited per
// prompt regardless of who/what triggers it (first-time auto-check from
// PromptForm, or a manual "re-check" click) - otherwise a rapid double
// click, an accidental resubmit, or a scripted retry loop could run up
// real API spend with no bound.
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 check per prompt per hour

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
    .select("id, text, brand_id, last_checked_at, brands(name, competitors)")
    .eq("id", promptId)
    .single();

  const brand = Array.isArray(prompt?.brands) ? prompt?.brands[0] : prompt?.brands;
  if (!prompt || !brand) {
    // Either the prompt doesn't exist, or RLS hid it because it belongs
    // to someone else's brand - both look the same from here.
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  if (prompt.last_checked_at) {
    const elapsedMs = Date.now() - new Date(prompt.last_checked_at).getTime();
    if (elapsedMs < RATE_LIMIT_MS) {
      const retryAfterSec = Math.ceil((RATE_LIMIT_MS - elapsedMs) / 1000);
      const retryAfterMin = Math.ceil(retryAfterSec / 60);
      // No locale is known server-side - return a code + the raw number
      // and let the client build the translated message (see
      // RecheckPromptButton).
      return NextResponse.json(
        { code: "rate_limited", retryAfterMin },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }
  }

  // Claim the slot before doing any of the (slow, costly) provider calls,
  // so a rapid double-click or resubmit can't both pass the check above
  // before either has a chance to record that a check just started.
  const { error: claimError } = await supabase
    .from("prompts")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", promptId);
  if (claimError) {
    console.error(`check-now: failed to claim rate-limit slot for prompt ${promptId}:`, claimError.message);
  }

  try {
    const admin = createAdminClient();

    // Fetched before running the query so a failed provider call can
    // fall back to "what did we already know" instead of overwriting it
    // with a blank result - see the comment below.
    const { data: previousRows } = await admin
      .from("rankings")
      .select("provider, mentioned, rank_position, checked_at")
      .eq("prompt_id", prompt.id)
      .order("checked_at", { ascending: false })
      .limit(12);
    const previousByProvider = new Map<string, { mentioned: boolean; rank_position: number | null }>();
    for (const row of previousRows ?? []) {
      if (!previousByProvider.has(row.provider)) {
        previousByProvider.set(row.provider, { mentioned: row.mentioned, rank_position: row.rank_position });
      }
    }

    const results = await runGeoQuery({
      prompt: prompt.text,
      brandName: brand.name,
      competitors: brand.competitors ?? [],
    });

    const checkedAt = new Date().toISOString();
    // A provider call that timed out or errored must never be written
    // as a real "not mentioned" (a false "圏外") - it would silently
    // read as a genuine drop everywhere this data is used. On error,
    // carry forward the last known-good mentioned/rank_position for
    // that provider instead, and keep `error` set so it's still visible
    // (see the dashboard's per-cell warning icon).
    const { error: insertError } = await admin.from("rankings").insert(
      results.map((result) => {
        if (result.error) {
          const previous = previousByProvider.get(result.provider);
          return {
            brand_id: prompt.brand_id,
            prompt_id: prompt.id,
            provider: result.provider,
            mentioned: previous?.mentioned ?? false,
            rank_position: previous?.rank_position ?? null,
            sentiment: null,
            competitors_mentioned: [],
            citations: [],
            raw_response: null,
            error: result.error,
            checked_at: checkedAt,
          };
        }
        return {
          brand_id: prompt.brand_id,
          prompt_id: prompt.id,
          provider: result.provider,
          mentioned: result.mentioned,
          rank_position: result.rankPosition,
          sentiment: result.sentiment,
          competitors_mentioned: result.competitorsMentioned,
          citations: result.citations,
          raw_response: result.rawResponse || null,
          error: null,
          checked_at: checkedAt,
        };
      })
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
