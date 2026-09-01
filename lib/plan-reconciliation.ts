/**
 * Keeps a user's *active* brand/prompt count in line with whatever plan
 * they're on right now - run after every Stripe plan-change webhook
 * (see app/api/webhooks/stripe/route.ts), not just at creation time.
 *
 * lib/plan-limits.ts's assertCanAddBrand/assertCanAddPrompt only block
 * *growth* past the current plan's cap - on their own they'd leave a
 * downgrade doing nothing at all: every brand/prompt from the old,
 * larger plan would keep running fully forever, still billed in full
 * against the operator's own LLM API accounts every morning while the
 * subscription itself dropped to a cheaper tier. That's the exact
 * cost/revenue mismatch the free-tier removal already had to fix once
 * (see the git history around lib/plan-limits.ts) - a downgrade without
 * this is the same problem in a different shape.
 *
 * Deactivates (never deletes - is_active=false, the same soft-disable
 * app/api/cron/daily-check/route.ts already filters on) the *newest*
 * rows first, so whatever was created earliest survives; the same pass
 * also *reactivates* rows (oldest-paused-first) whenever an upgrade
 * raises the limit back up, so an upgrade automatically brings back
 * exactly the set a prior downgrade paused, with nothing left for the
 * user to manually redo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { PLAN_LIMITS, normalizePlan } from "./plan-limits";

export interface ReconcileResult {
  deactivatedBrands: string[];
  reactivatedBrands: string[];
  deactivatedPrompts: string[];
  reactivatedPrompts: string[];
}

interface Row {
  id: string;
  is_active: boolean;
}

/**
 * Given `rows` already ordered oldest-first, brings each row's
 * is_active state in line with `limit` (null = unlimited, everyone
 * active) and writes only the rows whose state actually needs to
 * change. Returns the human-readable labels of whatever changed, for
 * the notification email.
 */
async function reconcileRows<T extends Row>(
  supabase: SupabaseClient,
  table: "brands" | "prompts",
  rows: T[],
  limit: number | null,
  getLabel: (row: T) => string
): Promise<{ deactivated: string[]; reactivated: string[] }> {
  const shouldBeActiveIds = new Set(limit === null ? rows.map((r) => r.id) : rows.slice(0, limit).map((r) => r.id));

  const toDeactivate = rows.filter((r) => r.is_active && !shouldBeActiveIds.has(r.id));
  const toReactivate = rows.filter((r) => !r.is_active && shouldBeActiveIds.has(r.id));

  if (toDeactivate.length > 0) {
    await supabase
      .from(table)
      .update({ is_active: false })
      .in(
        "id",
        toDeactivate.map((r) => r.id)
      );
  }
  if (toReactivate.length > 0) {
    await supabase
      .from(table)
      .update({ is_active: true })
      .in(
        "id",
        toReactivate.map((r) => r.id)
      );
  }

  return { deactivated: toDeactivate.map(getLabel), reactivated: toReactivate.map(getLabel) };
}

export async function reconcileUsageWithPlan(
  supabase: SupabaseClient,
  userId: string,
  plan: string | null | undefined
): Promise<ReconcileResult> {
  const tier = normalizePlan(plan);
  const { maxBrands, maxPromptsTotal } = PLAN_LIMITS[tier];

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, is_active")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const brandResult = brands
    ? await reconcileRows(supabase, "brands", brands, maxBrands, (b) => b.name)
    : { deactivated: [], reactivated: [] };

  // Prompt limit is total across ALL of the user's brands combined
  // (matches assertCanAddPrompt), so it's computed from every brand's
  // prompts together rather than per brand.
  const brandIds = (brands ?? []).map((b) => b.id);
  let promptResult = { deactivated: [] as string[], reactivated: [] as string[] };
  if (brandIds.length > 0) {
    const { data: prompts } = await supabase
      .from("prompts")
      .select("id, text, is_active")
      .in("brand_id", brandIds)
      .order("created_at", { ascending: true });

    if (prompts) {
      promptResult = await reconcileRows(supabase, "prompts", prompts, maxPromptsTotal, (p) => p.text);
    }
  }

  return {
    deactivatedBrands: brandResult.deactivated,
    reactivatedBrands: brandResult.reactivated,
    deactivatedPrompts: promptResult.deactivated,
    reactivatedPrompts: promptResult.reactivated,
  };
}
