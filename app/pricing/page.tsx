import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Layers, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { T } from "@/components/t";
import { LangToggle } from "@/components/lang-toggle";
import { UpgradeButtonLabel } from "@/app/dashboard/upgrade-button-label";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

const PLANS = [
  {
    name: "Pro",
    price: "¥9,800",
    descKey: "landing.proDesc",
    featureKeys: [
      "landing.proFeature1",
      "landing.proFeature2",
      "landing.proFeature3",
      "landing.proFeature4",
      "landing.proFeature5",
    ],
    priceIdEnv: "STRIPE_PRICE_ID_PRO",
    ctaKey: "pricing.ctaPro",
    highlighted: true,
  },
  {
    name: "Business",
    price: "¥29,800",
    descKey: "landing.businessDesc",
    // businessFeature0 ("everything in Pro") is rendered with a
    // different icon/weight below to read as "inherits the tier
    // below", not just another bullet - see the map() call.
    featureKeys: [
      "landing.businessFeature0",
      "landing.businessFeature1",
      "landing.businessFeature2",
      "landing.businessFeature3",
      "landing.businessFeature4",
    ],
    priceIdEnv: "STRIPE_PRICE_ID_BUSINESS",
    ctaKey: "pricing.ctaBusiness",
    highlighted: false,
  },
] as const;

/**
 * Plan-selection screen shown to any logged-in user who isn't on a paid
 * plan yet - the mandatory stop between signup and the dashboard, since
 * there is no free tier (see lib/plan-limits.ts). Middleware redirects
 * unpaid visitors to /dashboard/* here; this page redirects the other
 * way once a subscription is active, so nobody sees pricing twice.
 */
export default async function PricingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (profile?.plan === "pro" || profile?.plan === "business") {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b border-border bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </Link>
          <div className="flex items-center gap-3">
            <LangToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="container flex flex-1 flex-col items-center py-16">
        <div className="mb-10 max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            <T k="pricing.title" />
          </h1>
          <p className="mt-3 text-muted-foreground">
            <T k="pricing.subtitle" />
          </p>
        </div>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-6 pt-3 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={`relative flex h-full flex-col ${
                plan.highlighted ? "border-primary shadow-lg ring-1 ring-primary" : ""
              }`}
            >
              {plan.highlighted && (
                <Badge className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 shadow-sm">
                  <T k="landing.recommended" />
                </Badge>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">
                    <T k="pricing.perMonth" />
                  </span>
                </div>
                <CardDescription>
                  <T k={plan.descKey} />
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="flex flex-1 flex-col gap-2">
                  {plan.featureKeys.map((key) =>
                    key === "landing.businessFeature0" ? (
                      <li key={key} className="flex items-center gap-2 text-sm font-medium">
                        <Layers className="h-4 w-4 shrink-0 text-primary" />
                        <T k={key} />
                      </li>
                    ) : key === "landing.businessFeature4" ? (
                      // A caveat/note, not a feature - no checkmark, muted.
                      <li key={key} className="pl-6 text-xs text-muted-foreground">
                        <T k={key} />
                      </li>
                    ) : (
                      <li key={key} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        <T k={key} />
                      </li>
                    )
                  )}
                </ul>
                <UpgradeButtonLabel priceId={process.env[plan.priceIdEnv] ?? ""} labelKey={plan.ctaKey} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
