import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/t";
import { CheckoutPolling } from "./checkout-polling";

/**
 * Landing spot right after a successful Stripe Checkout (see the
 * success_url in app/api/checkout/route.ts). Doesn't redirect straight
 * to /dashboard because the webhook that marks profiles.plan as paid
 * runs asynchronously and can lag the redirect by a second or more -
 * arriving there too early would get bounced back to /pricing by the
 * paywall guard in middleware.ts. CheckoutPolling waits for that to
 * land before sending the user on.
 */
export default async function CheckoutCompletePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </div>
          <CardTitle>
            <T k="dashboard.checkoutThanks" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CheckoutPolling />
        </CardContent>
      </Card>
    </main>
  );
}
