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
import { isTrialEligible, TRIAL_PERIOD_DAYS } from "@/lib/stripe";

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
    ctaKeyTrial: "pricing.ctaProTrial",
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
    ctaKeyTrial: "pricing.ctaBusinessTrial",
    highlighted: false,
  },
] as const;

/**
 * Plan-selection screen shown to any logged-in user who isn't on a paid
 * plan yet - the mandatory stop between signup and the dashboard, since
 * there is no free tier (see lib/plan-limits.ts). Middleware redirects
 * unpaid visitors to /dashboard/* here; this page redirects the other
 * way once a subscription is active, so nobody sees pricing twice.
 *
 * `?plan=pro`/`?plan=business` (from the marketing page's own per-plan
 * CTAs, or from /login's `next` param once a just-authenticated visitor
 * lands back here) highlights that card instead of leaving the visitor
 * to re-find the plan they already picked. This is presentational only
 * - it never pre-fills a priceId or auto-triggers UpgradeButton's own
 * checkout call, which always requires an explicit click of its own
 * (see that component's preview/confirm flow for plan changes) so
 * nobody is ever redirected into a paid checkout without having just
 * clicked something on this exact page themselves.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const selectedPlan = searchParams.plan?.toLowerCase();
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profile?.plan === "pro" || profile?.plan === "business") {
    redirect("/dashboard");
  }

  // Only ever shown to someone who has never had a Stripe customer
  // record before (see lib/stripe.ts's isTrialEligible) - a returning/
  // lapsed customer re-subscribing sees the plain "subscribe now"
  // copy instead, since they would not actually get a second trial.
  // Further restricted to Pro only (see app/api/checkout/route.ts's
  // matching restriction) - Business's higher limits mean an
  // unconverted trial can cost far more if maxed out, and someone who
  // already knows they want Business is better served subscribing
  // directly than through a generic self-serve trial.
  const accountTrialEligible = isTrialEligible(profile);

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
            <T
              k={accountTrialEligible ? "pricing.subtitleTrial" : "pricing.subtitle"}
              vars={{ days: TRIAL_PERIOD_DAYS }}
            />
          </p>
        </div>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-6 pt-3 sm:grid-cols-2">
          {PLANS.map((plan) => {
            const offerTrial = accountTrialEligible && plan.priceIdEnv === "STRIPE_PRICE_ID_PRO";
            // An explicit `?plan=` selection takes priority over the
            // static "recommended" badge - once someone has actually
            // picked a plan (from the marketing page or a returning
            // /login redirect), showing them "recommended" on a
            // DIFFERENT card than the one they clicked would read as
            // this page second-guessing their own choice.
            const isSelected = !!selectedPlan && plan.name.toLowerCase() === selectedPlan;
            const badgeKey = isSelected ? "pricing.selectedPlanBadge" : plan.highlighted ? "landing.recommended" : null;
            return (
            <Card
              key={plan.name}
              className={`relative flex h-full flex-col ${
                plan.highlighted || isSelected ? "border-primary shadow-lg ring-1 ring-primary" : ""
              }`}
            >
              {badgeKey && (
                <Badge className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 shadow-sm">
                  <T k={badgeKey} />
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
                {/* Always rendered (just invisible when not applicable) so
                    both cards reserve the same header height regardless of
                    trial eligibility - otherwise the shorter (non-trial)
                    card's button ends up sitting noticeably higher than
                    the other card's, side by side. */}
                <Badge variant="secondary" className={`w-fit ${offerTrial ? "" : "invisible"}`}>
                  <T k="pricing.trialBadge" vars={{ days: TRIAL_PERIOD_DAYS }} />
                </Badge>
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
                <div className="flex flex-col gap-2">
                  <UpgradeButtonLabel
                    priceId={process.env[plan.priceIdEnv] ?? ""}
                    labelKey={offerTrial ? plan.ctaKeyTrial : plan.ctaKey}
                    labelVars={offerTrial ? { days: TRIAL_PERIOD_DAYS } : undefined}
                  />
                  {/* Same reasoning as the header badge above - always
                      reserve the line's height so both buttons land at
                      the same vertical position. */}
                  <p className={`text-center text-xs text-muted-foreground ${offerTrial ? "" : "invisible"}`}>
                    <T k="pricing.trialNote" />
                  </p>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
