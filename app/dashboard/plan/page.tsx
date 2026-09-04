import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/t";

import { UpgradePrompt } from "../upgrade-button";
import { ManageSubscriptionButton } from "../manage-subscription-button";

const PLAN_LABELS: Record<string, string | null> = {
  free: null, // rendered via <T k="dashboard.notSubscribed" /> instead
  pro: "Pro",
  business: "Business",
};

/**
 * Split out of /dashboard/settings (2026-09, "ナビゲーション・タブの
 * 独立・再構築") into its own route. Previously this was a card at
 * `/dashboard/settings#billing`, reached from the mobile drawer via a
 * same-page hash link (nav-items.ts's old MOBILE_BILLING_ITEM) - that
 * hash was the direct cause of a real double-highlight bug (a hashed
 * item and its parent page both reduce to the same pathname). Now a
 * real, independent page, so the mobile drawer and desktop sidebar can
 * both point straight at it with a plain nav item like every other
 * page - see nav-items.ts's isNavItemActive for the unified check this
 * enables.
 */
export default async function PlanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  const plan = profile?.plan ?? "free";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <T k="settings.planPageTitle" />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <T k="settings.planPageSubtitle" />
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <T k="dashboard.plan" />
          </CardTitle>
          <CardDescription>
            <T k="settings.currentPlan" />: {PLAN_LABELS[plan] ?? plan ?? <T k="dashboard.notSubscribed" />}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {plan === "free" && (
            <UpgradePrompt
              proPriceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
              businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
            />
          )}
          {plan !== "free" && (
            <>
              <p className="text-sm text-muted-foreground">
                <T k="settings.subscribedThanks" />
              </p>
              <ManageSubscriptionButton />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
