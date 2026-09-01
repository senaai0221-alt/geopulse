import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";

import { getStripe, planTierFromPriceId } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileUsageWithPlan } from "@/lib/plan-reconciliation";
import { sendPlanUsageChangeEmail } from "@/lib/email";
import { enforceOneTrialPerCard } from "@/lib/trial-fraud-guard";

export const dynamic = "force-dynamic";

/**
 * Stripe Webhook handler. Must receive the RAW request body for
 * signature verification, so no other middleware should parse it first.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("Missing stripe-signature header");
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency guard: Stripe redelivers an event whenever this endpoint
  // doesn't answer 200 in time, and can also deliver the same event
  // twice anyway as part of its normal at-least-once guarantee. Without
  // this check a replay re-runs the whole handler below - a hard error
  // for enforceOneTrialPerCard's insert into trial_card_fingerprints
  // (a duplicate primary key), and pointless duplicate work everywhere
  // else. See supabase/schema.sql's processed_stripe_events table.
  const { data: alreadyProcessed } = await supabase
    .from("processed_stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();

  if (alreadyProcessed) {
    console.log(`Stripe webhook event ${event.id} (${event.type}) already processed - skipping duplicate delivery`);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id ?? session.client_reference_id;
        if (!userId) break;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;

        let priceId: string | null = null;
        // Real status from the subscription object, not a hardcoded
        // "active" - a card-required free trial (see lib/stripe.ts's
        // TRIAL_PERIOD_DAYS) completes checkout immediately but the
        // subscription itself is "trialing", not "active", until the
        // trial period actually ends.
        let status = "active";
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          priceId = subscription.items.data[0]?.price.id ?? null;
          status = subscription.status;

          // A trial only ever legitimately happens once per physical
          // card, not once per account - see lib/trial-fraud-guard.ts.
          // A best-effort check: if it fails, the trial proceeds rather
          // than the whole checkout webhook erroring out.
          if (status === "trialing") {
            try {
              const result = await enforceOneTrialPerCard(stripe, supabase, { subscriptionId, userId });
              status = result.subscriptionStatus;
            } catch (err) {
              console.error(`Trial fraud guard failed for subscription ${subscriptionId}:`, err);
            }
          }
        }

        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId ?? null,
            stripe_price_id: priceId,
            plan: planTierFromPriceId(priceId),
            subscription_status: status,
          })
          .eq("id", userId);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id ?? null;
        const isActive = subscription.status === "active" || subscription.status === "trialing";
        const newPlan = isActive ? planTierFromPriceId(priceId) : "free";

        const metadataUserId = subscription.metadata?.supabase_user_id;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

        // Resolved up front (rather than a blind update-by-whichever-key-
        // is-available) so the plan-limit reconciliation and
        // notification email below both have the real user id/email to
        // work with, regardless of which lookup path finds the row.
        const { data: profile } = metadataUserId
          ? await supabase
              .from("profiles")
              .select("id, email, notification_email, email_alerts_enabled")
              .eq("id", metadataUserId)
              .single()
          : await supabase
              .from("profiles")
              .select("id, email, notification_email, email_alerts_enabled")
              .eq("stripe_customer_id", customerId)
              .single();

        if (!profile) break;

        await supabase
          .from("profiles")
          .update({
            stripe_subscription_id: subscription.id,
            stripe_price_id: priceId,
            plan: newPlan,
            subscription_status: subscription.status,
          })
          .eq("id", profile.id);

        // Brings the account's active brand/prompt count in line with
        // whatever plan it's on now - a downgrade must not leave
        // everything from the old, larger plan still running against
        // the operator's own LLM API accounts every morning with no
        // matching revenue; an upgrade automatically restores exactly
        // what a prior downgrade paused. See lib/plan-reconciliation.ts.
        const usage = await reconcileUsageWithPlan(supabase, profile.id, newPlan);
        const hasUsageChanges =
          usage.deactivatedBrands.length > 0 ||
          usage.deactivatedPrompts.length > 0 ||
          usage.reactivatedBrands.length > 0 ||
          usage.reactivatedPrompts.length > 0;

        if (hasUsageChanges && profile.email_alerts_enabled !== false) {
          const to = profile.notification_email || profile.email;
          if (to) {
            try {
              await sendPlanUsageChangeEmail(to, { newPlan, ...usage });
            } catch (err) {
              console.error(`Failed to send plan usage change email for user ${profile.id}:`, err);
            }
          }
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe webhook event ${event.type}:`, err);
    Sentry.captureException(err, { tags: { stripeEventType: event.type, stripeEventId: event.id } });
    // Deliberately NOT recorded in processed_stripe_events - a non-200
    // here tells Stripe to redeliver, which is exactly what should
    // happen when the handler actually failed (as opposed to the
    // logged-and-continued best-effort failures inside individual
    // branches above, e.g. enforceOneTrialPerCard or the notification
    // email, which reach this point as a normal success).
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  // Recorded only once the handler above has fully succeeded, so a
  // replay of this same event.id short-circuits at the guard above
  // instead of re-running everything.
  const { error: recordError } = await supabase.from("processed_stripe_events").insert({ id: event.id });
  if (recordError) {
    // Not fatal - worst case a legitimate retry (e.g. a near-simultaneous
    // duplicate delivery racing this same insert) re-runs the handler
    // once more, which the branches above already tolerate individually.
    console.error(`Failed to record processed Stripe event ${event.id}:`, recordError);
  }

  return NextResponse.json({ received: true });
}
