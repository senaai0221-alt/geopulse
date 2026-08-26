import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe, planTierFromPriceId } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

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
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          priceId = subscription.items.data[0]?.price.id ?? null;
        }

        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId ?? null,
            stripe_price_id: priceId,
            plan: planTierFromPriceId(priceId),
            subscription_status: "active",
          })
          .eq("id", userId);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        const priceId = subscription.items.data[0]?.price.id ?? null;
        const isActive = subscription.status === "active" || subscription.status === "trialing";

        const updatePayload = {
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
          plan: isActive ? planTierFromPriceId(priceId) : ("free" as const),
          subscription_status: subscription.status,
        };

        if (userId) {
          await supabase.from("profiles").update(updatePayload).eq("id", userId);
        } else {
          // Fallback lookup by customer id if metadata wasn't propagated.
          const customerId =
            typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
          await supabase.from("profiles").update(updatePayload).eq("stripe_customer_id", customerId);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling Stripe webhook event ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
