import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/**
 * Creates a Stripe Checkout Session for the authenticated user and
 * returns its URL. The client redirects the browser to that URL.
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
  const priceId = String(body.priceId ?? "");

  const allowedPriceIds = [
    process.env.STRIPE_PRICE_ID_PRO,
    process.env.STRIPE_PRICE_ID_BUSINESS,
  ].filter(Boolean);

  if (!priceId || !allowedPriceIds.includes(priceId)) {
    return NextResponse.json({ error: "Invalid priceId" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id, subscription_status, email")
    .eq("id", user.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const stripe = getStripe();

  // Already has an active subscription (Pro <-> Business plan change) -
  // update that subscription in place instead of starting a Checkout
  // Session. A Checkout Session always creates a brand-new subscription;
  // reusing it here would leave the old one running untouched (same
  // Stripe customer, two active subscriptions) and silently double-bill
  // every month, since profiles only tracks one stripe_subscription_id
  // and would just get overwritten with the new one - the old
  // subscription would keep charging with no way to see it in the app.
  // `always_invoice` charges/credits the prorated difference right away
  // rather than waiting for the next billing cycle, matching what an
  // "upgrade now" click should actually do. The resulting
  // customer.subscription.updated webhook event is already handled
  // correctly (see app/api/webhooks/stripe/route.ts) - only this entry
  // point was wrong.
  if (profile?.stripe_subscription_id && profile.subscription_status === "active") {
    try {
      const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
      const currentItem = subscription.items.data[0];

      if (currentItem && currentItem.price.id !== priceId) {
        await stripe.subscriptions.update(profile.stripe_subscription_id, {
          items: [{ id: currentItem.id, price: priceId }],
          proration_behavior: "always_invoice",
        });
      }

      return NextResponse.json({ ok: true, updatedInPlace: true });
    } catch (error) {
      console.error("Stripe subscription plan change failed:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Plan change failed" },
        { status: 500 }
      );
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: profile?.stripe_customer_id ?? undefined,
      customer_email: profile?.stripe_customer_id ? undefined : profile?.email ?? user.email ?? undefined,
      client_reference_id: user.id,
      // /checkout/complete polls until profiles.plan reflects the new
      // subscription (the Stripe webhook updates it asynchronously) and
      // only then sends the user on to /dashboard - avoids a race where
      // landing on /dashboard before the webhook lands gets the user
      // bounced back to /pricing by the paywall guard in middleware.ts.
      success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      // Managed Payments requires a tax code on every Product; this app
      // handles tax/fraud itself, so opt out at the session level.
      managed_payments: { enabled: false },
    } as Stripe.Checkout.SessionCreateParams);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session creation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout session creation failed" },
      { status: 500 }
    );
  }
}
