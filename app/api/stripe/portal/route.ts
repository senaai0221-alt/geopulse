import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

/**
 * Creates a Stripe Billing Portal session for the authenticated user's
 * own Customer ID and returns its URL - the self-serve entry point for
 * cancelling, updating the card on file, or downloading past invoices,
 * so those don't have to go through support manually.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    // A known, expected state (e.g. a plan set manually in the DB
    // without ever going through Checkout) rather than a failure -
    // return a code so the client can show a translated, non-alarming
    // message instead of a raw error string with no locale awareness
    // (this route has no idea which language the caller's UI is in).
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const stripe = getStripe();

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/dashboard/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe billing portal session creation failed:", error);
    return NextResponse.json({ error: "portal_error" }, { status: 500 });
  }
}
