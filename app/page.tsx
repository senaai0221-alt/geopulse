import Link from "next/link";
import { ArrowRight, Bell, LineChart, Sparkles, Slack, CheckCircle2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { T } from "@/components/t";
import { LangToggle } from "@/components/lang-toggle";

const PROVIDERS = ["ChatGPT", "Claude", "Perplexity", "Gemini"];

const FEATURES = [
  { icon: LineChart, titleKey: "landing.feature1Title", descKey: "landing.feature1Desc" },
  { icon: Bell, titleKey: "landing.feature2Title", descKey: "landing.feature2Desc" },
  { icon: Slack, titleKey: "landing.feature3Title", descKey: "landing.feature3Desc" },
  { icon: Sparkles, titleKey: "landing.feature4Title", descKey: "landing.feature4Desc" },
] as const;

const PLANS = [
  {
    name: "Pro",
    price: "¥9,800",
    period: "/mo",
    descKey: "landing.proDesc",
    featureKeys: ["landing.proFeature1", "landing.proFeature2", "landing.proFeature3", "landing.proFeature4"],
    highlighted: true,
  },
  {
    name: "Business",
    price: "¥29,800",
    period: "/mo",
    descKey: "landing.businessDesc",
    featureKeys: [
      "landing.businessFeature1",
      "landing.businessFeature2",
      "landing.businessFeature3",
      "landing.businessFeature4",
    ],
    highlighted: false,
  },
] as const;

export default function LandingPage() {
  return (
    <main className="flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </div>
          <nav className="flex items-center gap-4">
            <LangToggle />
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              <T k="nav.login" />
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
              <T k="nav.getStarted" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-24 text-center">
        <Badge variant="secondary" className="mb-4">
          <T k="landing.badge" />
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          <T k="landing.heroTitle1" />
          <br />
          <T k="landing.heroTitle2" />
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          <T k="landing.heroDescription" />
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
            <T k="nav.getStarted" /> <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link href="#pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
            <T k="landing.viewPricing" />
          </Link>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {PROVIDERS.map((p) => (
            <Badge key={p} variant="outline" className="px-4 py-1.5 text-sm">
              {p}
            </Badge>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            <T k="landing.featuresTitle" />
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <Card key={feature.titleKey}>
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary" />
                  <CardTitle className="mt-2">
                    <T k={feature.titleKey} />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    <T k={feature.descKey} />
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            <T k="landing.pricingTitle" />
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            <T k="landing.pricingSubtitle" />
          </p>
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={plan.highlighted ? "border-primary shadow-lg ring-1 ring-primary" : ""}
              >
                <CardHeader>
                  {plan.highlighted && (
                    <Badge className="mb-2 w-fit">
                      <T k="landing.recommended" />
                    </Badge>
                  )}
                  <CardTitle>{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <T k={plan.descKey} />
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-2">
                    {plan.featureKeys.map((key) => (
                      <li key={key} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        <T k={key} />
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/login"
                    className={cn(
                      buttonVariants({ variant: plan.highlighted ? "default" : "outline" }),
                      "w-full"
                    )}
                  >
                    <T k="nav.getStarted" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <span>
            © {new Date().getFullYear()} ENDEVER, Inc. <T k="landing.footerRights" />
          </span>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              <T k="nav.login" />
            </Link>
            <Link href="/legal/tokushoho" className="hover:text-foreground">
              <T k="landing.footerTokushoho" />
            </Link>
            <Link href="/legal/terms" className="hover:text-foreground">
              <T k="landing.footerTerms" />
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground">
              <T k="landing.footerPrivacy" />
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
