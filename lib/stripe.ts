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

/** Maps a Stripe Price ID (from env) back to our internal plan tier. */
export function planTierFromPriceId(priceId: string | null | undefined): PlanTier {
  if (!priceId) return "free";
  if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) return "business";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  return "free";
}
