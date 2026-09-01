import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

/** Lazily-initialized server-side Stripe client. */
export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeSingleton = new Stripe(secretKey, {
      apiVersion: "2024-06-20",
      typescript: true,
    });
  }
  return stripeSingleton;
}

export type PlanTier = "free" | "pro" | "business";

/** Length of the card-required free trial offered on a first-ever
 *  subscription (see app/api/checkout/route.ts and app/pricing/page.tsx).
 *  A card is always collected up front (payment_method_collection:
 *  "always") specifically so this can't be abused the same way an
 *  open, no-card free tier already was (see lib/plan-limits.ts's own
 *  comment on why there is no free tier) - the trial converts to a
 *  real charge automatically at the end unless the customer cancels,
 *  and a disposable-email abuser has to also keep supplying a working
 *  card, which is real friction a truly free tier never had. */
export const TRIAL_PERIOD_DAYS = 14;

/** A trial is offered only on a profile that has never had a Stripe
 *  customer record at all - stripe_customer_id is set the first time
 *  anyone subscribes and is never cleared afterward (including on
 *  cancellation), so a lapsed/returning customer re-subscribing does
 *  not get a second free trial. */
export function isTrialEligible(profile: { stripe_customer_id?: string | null } | null | undefined): boolean {
  return !profile?.stripe_customer_id;
}

/** Maps a Stripe Price ID (from env) back to our internal plan tier. */
export function planTierFromPriceId(priceId: string | null | undefined): PlanTier {
  if (!priceId) return "free";
  if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) return "business";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  return "free";
}
