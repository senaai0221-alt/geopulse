import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Polled by app/checkout/complete after a successful Stripe Checkout to
 * find out whether the webhook has updated profiles.plan yet. Returns
 * the caller's own plan only - never another user's.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ plan: profile?.plan ?? "free" });
}
