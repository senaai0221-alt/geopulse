import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPromptCheckNow } from "@/lib/prompt-check";
import { checkMonthlyLlmBudget, getMonthlyManualCheckCount } from "@/lib/cost-budget";
import { PLAN_LIMITS, normalizePlan } from "@/lib/plan-limits";

export const dynamic = "force-dynamic";
// One prompt across 6 providers, run in parallel (see runGeoQuery) with a
// 30s per-provider timeout - comfortably inside the 60s Hobby-plan cap.
export const maxDuration = 60;

// Each call fans out to 6 paid LLM APIs, so this is rate-limited per
// prompt regardless of who/what triggers it - currently that's only the
// first-time auto-check PromptForm fires right after a prompt is
// created (there is no manual re-check button in the UI) - otherwise a
// rapid double-fire or a scripted retry loop could run up real API
// spend with no bound.
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 check per prompt per hour

/**
 * Runs one immediate measurement for a single, newly-created prompt so a
 * new subscriber sees real data right away instead of an empty table
 * until tomorrow's cron. Triggered fire-and-forget from PromptForm right
 * after the prompt is inserted - the only caller today; there is no
 * manual re-check button anywhere in the dashboard.
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
    .select("id, text, brand_id, last_checked_at, brands(name, aliases, competitors)")
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
      // and let the client build the translated message.
      return NextResponse.json(
        { code: "rate_limited", retryAfterMin },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }
  }

  const admin = createAdminClient();

  // Per-tenant monthly cap on manual checks (2026-09) - closes a real
  // gap the rate limit just above can't: deleting a prompt and
  // recreating an identical one resets its last_checked_at to null,
  // sidestepping that 1-hour cooldown entirely. This caps the whole
  // ACCOUNT's manual-check total for the month regardless of how many
  // distinct prompt rows it cycles through to get there - see
  // lib/plan-limits.ts's maxManualChecksPerMonth and lib/cost-budget.ts's
  // getMonthlyManualCheckCount. Prompt creation itself is never blocked
  // by this (see PromptForm's own fire-and-forget call) - only this
  // instant first-check is skipped, and the prompt is picked up
  // normally by tomorrow's cron either way.
  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  const { maxManualChecksPerMonth } = PLAN_LIMITS[normalizePlan(profile?.plan)];
  if (maxManualChecksPerMonth !== null) {
    const manualCheckCount = await getMonthlyManualCheckCount(admin, user.id);
    if (manualCheckCount >= maxManualChecksPerMonth) {
      return NextResponse.json(
        { code: "manual_check_monthly_limit", limit: maxManualChecksPerMonth },
        { status: 429 }
      );
    }
  }

  // Circuit breaker (2026-09): if the operator's own monthly LLM spend
  // has already hit the configured ceiling, refuse to spend more on a
  // discretionary/manual check here - the daily cron (the paid service's
  // own core promise to every subscriber) is deliberately NOT gated by
  // this same check and keeps running regardless; see
  // app/api/cron/daily-check/route.ts's own budget check for that half.
  // checkMonthlyLlmBudget needs the admin client (it sums cost_usd
  // across every customer's rankings, which no RLS-scoped client could
  // ever see) and silently returns null - no gate at all - until
  // MONTHLY_LLM_BUDGET_USD is actually configured; see lib/cost-budget.ts.
  const budgetStatus = await checkMonthlyLlmBudget(admin);
  if (budgetStatus?.level === "critical") {
    return NextResponse.json({ code: "budget_exceeded" }, { status: 503 });
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
    const result = await runPromptCheckNow(admin, {
      promptId: prompt.id,
      promptText: prompt.text,
      brandId: prompt.brand_id,
      brandName: brand.name,
      brandAliases: brand.aliases ?? [],
      competitors: brand.competitors ?? [],
    });

    if (!result.ok) {
      console.error(`check-now: failed to insert rankings for prompt ${promptId}:`, result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
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
