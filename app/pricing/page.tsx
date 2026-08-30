import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UpgradeButton } from "@/app/dashboard/upgrade-button";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

const PLANS = [
  {
    name: "Pro",
    price: "¥9,800",
    description: "本格運用するチーム向け",
    features: [
      "5ブランドまで",
      "プロンプト無制限",
      "毎朝自動計測",
      "Slack異常検知アラート",
    ],
    priceIdEnv: "STRIPE_PRICE_ID_PRO",
    cta: "Proを選択して決済する",
    highlighted: true,
  },
  {
    name: "Business",
    price: "¥29,800",
    description: "複数ブランド・代理店向け",
    features: [
      "ブランド無制限",
      "プロンプト無制限",
      "毎朝自動計測",
      "Slack異常検知アラート",
    ],
    priceIdEnv: "STRIPE_PRICE_ID_BUSINESS",
    cta: "Businessを選択して決済する",
    highlighted: false,
  },
];

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
          <SignOutButton />
        </div>
      </header>

      <div className="container flex flex-1 flex-col items-center py-16">
        <div className="mb-10 max-w-xl text-center">
          <h1 className="text-3xl font-bold tracking-tight">プランを選んで始めましょう</h1>
          <p className="mt-3 text-muted-foreground">
            Zonostickは有料プランでご利用いただけます。プランを選択すると、そのまま決済画面に進みます。
            決済完了後、すぐにダッシュボードでブランドの追跡を開始できます。
          </p>
        </div>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={plan.highlighted ? "border-primary shadow-lg ring-1 ring-primary" : ""}
            >
              <CardHeader>
                {plan.highlighted && <Badge className="mb-2 w-fit">おすすめ</Badge>}
                <CardTitle>{plan.name}</CardTitle>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">/月</span>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <UpgradeButton
                  priceId={process.env[plan.priceIdEnv] ?? ""}
                  label={plan.cta}
                  size="lg"
                  className="w-full"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
