import type { PlanTier } from "./stripe";

/**
 * Per-plan usage caps, matching the numbers advertised on the landing
 * page (app/page.tsx PLANS). `null` means unlimited.
 *
 * These are deliberately conservative: every prompt is re-run against
 * all 6 LLMs every morning on the operator's own paid API accounts, so
 * the cap is what keeps that daily cost below what the subscription
 * revenue covers, not just a UX nicety.
 */
export interface PlanLimits {
  /** Max number of brands a user can track. */
  maxBrands: number | null;
  /** Max number of prompts across ALL of a user's brands combined (not per brand). */
  maxPromptsTotal: number | null;
}

// There is no free tier: the daily check calls paid LLM APIs on the
// operator's own account, so an unpaid user would be a pure cost sink
// with no revenue to offset it. A brand-new profile defaults to "free"
// (see supabase/schema.sql handle_new_user) only until the user
// subscribes via Stripe; until then they cannot add any brand/prompt.
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { maxBrands: 0, maxPromptsTotal: 0 },
  pro: { maxBrands: 3, maxPromptsTotal: 20 },
  business: { maxBrands: 10, maxPromptsTotal: 80 },
};

/** Normalizes whatever is stored in profiles.plan into a known PlanTier. */
export function normalizePlan(plan: string | null | undefined): PlanTier {
  return plan === "pro" || plan === "business" ? plan : "free";
}

// These throw plain error *codes* (never user-facing text) - Server
// Actions run before any locale is known, so the client-side catch block
// translates the code via lib/i18n/action-error.ts once it knows which
// language to show. See that file for the code -> message mapping.

/**
 * Throws a user-facing error if adding one more brand would exceed the
 * plan's limit. `currentCount` is the number of brands the user already
 * has before this addition.
 */
export function assertCanAddBrand(plan: string | null | undefined, currentCount: number): void {
  const tier = normalizePlan(plan);
  if (tier === "free") throw new Error("no_free_tier");

  const { maxBrands } = PLAN_LIMITS[tier];
  if (maxBrands !== null && currentCount >= maxBrands) {
    throw new Error(`brand_limit:${maxBrands}`);
  }
}

/**
 * Throws a user-facing error if adding one more prompt would exceed the
 * plan's limit. `currentCount` is the number of prompts the user already
 * has across ALL of their brands combined before this addition (not just
 * the one brand the new prompt is being added to).
 */
export function assertCanAddPrompt(plan: string | null | undefined, currentCount: number): void {
  const tier = normalizePlan(plan);
  if (tier === "free") throw new Error("no_free_tier");

  const { maxPromptsTotal } = PLAN_LIMITS[tier];
  if (maxPromptsTotal !== null && currentCount >= maxPromptsTotal) {
    throw new Error(`prompt_limit:${maxPromptsTotal}`);
  }
}
