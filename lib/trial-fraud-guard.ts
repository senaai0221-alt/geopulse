/**
 * Card-required trials (see lib/stripe.ts's isTrialEligible/
 * TRIAL_PERIOD_DAYS) only block a second trial on the *same account* -
 * profiles.stripe_customer_id is what that check is keyed on. On its
 * own that does nothing to stop someone from signing up again with a
 * fresh email address and the exact same physical card to get another
 * free ride. Stripe's card fingerprint is stable for one physical card
 * across every customer/account it's ever been attached to, so it's
 * the actual identity worth deduping a trial on.
 */
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Called right after a checkout completes with a trialing subscription.
 * If the card behind it has already been used for a trial before (by
 * any account), ends the trial immediately - the subscription just
 * converts straight to a normal paid one, same as if no trial had ever
 * been offered, rather than quietly granting a second free ride. A
 * genuinely new card is recorded so the *next* reuse gets caught.
 *
 * Fails open (never blocks a legitimate trial) if a fingerprint can't
 * be found at all - that should only happen if Stripe's own card
 * collection didn't actually attach a payment method, which
 * payment_method_collection: "always" on the Checkout Session is
 * meant to prevent in the first place.
 */
export async function enforceOneTrialPerCard(
  stripe: Stripe,
  supabase: SupabaseClient,
  params: { subscriptionId: string; userId: string }
): Promise<{ subscriptionStatus: string }> {
  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId, {
    expand: ["default_payment_method"],
  });

  if (subscription.status !== "trialing") {
    return { subscriptionStatus: subscription.status };
  }

  const fingerprint = await resolveCardFingerprint(stripe, subscription);
  if (!fingerprint) {
    return { subscriptionStatus: subscription.status };
  }

  const { data: existing } = await supabase
    .from("trial_card_fingerprints")
    .select("fingerprint")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing) {
    const ended = await stripe.subscriptions.update(params.subscriptionId, { trial_end: "now" });
    return { subscriptionStatus: ended.status };
  }

  // Errors here (e.g. a race with another signup using the same card at
  // the exact same moment) are logged by the caller, not thrown further -
  // failing to record a brand-new card must never block this genuinely
  // first-time trial from proceeding.
  await supabase.from("trial_card_fingerprints").insert({ fingerprint, first_used_by: params.userId });

  return { subscriptionStatus: subscription.status };
}

async function resolveCardFingerprint(stripe: Stripe, subscription: Stripe.Subscription): Promise<string | null> {
  const pm = subscription.default_payment_method;
  if (pm && typeof pm !== "string" && pm.card?.fingerprint) {
    return pm.card.fingerprint;
  }

  // Fallback: the subscription's own default_payment_method isn't
  // always populated immediately after Checkout - the customer's most
  // recently attached card is the next best signal.
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  return methods.data[0]?.card?.fingerprint ?? null;
}
