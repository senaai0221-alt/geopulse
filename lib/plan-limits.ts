import type { PlanTier } from "./stripe";

/**
 * Per-plan usage caps, matching the numbers advertised on the landing
 * page (app/page.tsx PLANS). `null` means unlimited.
 */
export interface PlanLimits {
  /** Max number of brands a user can track. */
  maxBrands: number | null;
  /** Max number of prompts per brand. */
  maxPromptsPerBrand: number | null;
}

// There is no free tier: the daily check calls paid LLM APIs on the
// operator's own account, so an unpaid user would be a pure cost sink
// with no revenue to offset it. A brand-new profile defaults to "free"
// (see supabase/schema.sql handle_new_user) only until the user
// subscribes via Stripe; until then they cannot add any brand/prompt.
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { maxBrands: 0, maxPromptsPerBrand: 0 },
  pro: { maxBrands: 5, maxPromptsPerBrand: null },
  business: { maxBrands: null, maxPromptsPerBrand: null },
};

const PLAN_LABELS: Record<PlanTier, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

const NO_FREE_TIER_MESSAGE =
  "Zonostickは現在、有料プラン(Pro/Business)のみでご利用いただけます。設定ページからプランをご契約のうえ、ブランドを追加してください。";

/** Normalizes whatever is stored in profiles.plan into a known PlanTier. */
export function normalizePlan(plan: string | null | undefined): PlanTier {
  return plan === "pro" || plan === "business" ? plan : "free";
}

/**
 * Throws a user-facing error if adding one more brand would exceed the
 * plan's limit. `currentCount` is the number of brands the user already
 * has before this addition.
 */
export function assertCanAddBrand(plan: string | null | undefined, currentCount: number): void {
  const tier = normalizePlan(plan);
  if (tier === "free") throw new Error(NO_FREE_TIER_MESSAGE);

  const { maxBrands } = PLAN_LIMITS[tier];
  if (maxBrands !== null && currentCount >= maxBrands) {
    throw new Error(
      `${PLAN_LABELS[tier]}プランは${maxBrands}ブランドまでです。プランをアップグレードすると追加できます(設定ページから変更できます)。`
    );
  }
}

/**
 * Throws a user-facing error if adding one more prompt to a brand would
 * exceed the plan's limit. `currentCount` is the number of prompts the
 * brand already has before this addition.
 */
export function assertCanAddPrompt(plan: string | null | undefined, currentCount: number): void {
  const tier = normalizePlan(plan);
  if (tier === "free") throw new Error(NO_FREE_TIER_MESSAGE);

  const { maxPromptsPerBrand } = PLAN_LIMITS[tier];
  if (maxPromptsPerBrand !== null && currentCount >= maxPromptsPerBrand) {
    throw new Error(
      `${PLAN_LABELS[tier]}プランは1ブランドあたりプロンプト${maxPromptsPerBrand}件までです。プランをアップグレードすると追加できます(設定ページから変更できます)。`
    );
  }
}
