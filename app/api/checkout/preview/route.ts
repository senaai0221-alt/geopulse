import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/**
 * Previews what an "upgrade" click would actually charge, without
 * charging anything - lets the client show a real confirmation ("this
 * charges ¥X,XXX right now") before the caller hits POST /api/checkout,
 * which for an existing active subscriber applies the plan change
 * immediately with no confirmation screen of its own (unlike a brand
 * new subscription, which always goes through Stripe's own hosted
 * Checkout page - a natural place to confirm). A stray click on the
 * wrong plan button should never silently charge someone.
 */
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const priceId = request.nextUrl.searchParams.get("priceId") ?? "";
  const allowedPriceIds = [process.env.STRIPE_PRICE_ID_PRO, process.env.STRIPE_PRICE_ID_BUSINESS].filter(
    Boolean
  );
  if (!priceId || !allowedPriceIds.includes(priceId)) {
    return NextResponse.json({ error: "Invalid priceId" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("id", user.id)
    .single();

  // No active subscription yet - this is a brand-new checkout, which
  // goes through Stripe's own hosted page (its own confirmation step).
  // Nothing to preview.
  if (!profile?.stripe_subscription_id || profile.subscription_status !== "active") {
    return NextResponse.json({ isPlanChange: false });
  }

  const stripe = getStripe();

  try {
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    const currentItem = subscription.items.data[0];

    if (!currentItem || currentItem.price.id === priceId) {
      // Already on this exact price - nothing would actually change.
      return NextResponse.json({ isPlanChange: false });
    }

    const preview = await stripe.invoices.createPreview({
      customer: profile.stripe_customer_id ?? undefined,
      subscription: profile.stripe_subscription_id,
      subscription_details: {
        items: [{ id: currentItem.id, price: priceId }],
        proration_behavior: "always_invoice",
      },
    });

    return NextResponse.json({
      isPlanChange: true,
      // Stripe amounts for JPY are already whole yen (JPY has no
      // sub-unit), unlike e.g. USD cents - no /100 needed here.
      amountDue: preview.amount_due,
      currency: preview.currency,
    });
  } catch (error) {
    console.error("Stripe invoice preview failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
