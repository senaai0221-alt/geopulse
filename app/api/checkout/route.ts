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
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const stripe = getStripe();

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
