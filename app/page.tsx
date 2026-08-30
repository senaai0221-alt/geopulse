import Link from "next/link";
import {
  ArrowRight,
  Bell,
  LineChart,
  Sparkles,
  Slack,
  CheckCircle2,
  Layers,
  MousePointerClick,
  FileDown,
  MessageSquareText,
  ChevronDown,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { T } from "@/components/t";
import { LangToggle } from "@/components/lang-toggle";
import { createClient } from "@/lib/supabase/server";

// All 6 providers Zonostick actually queries - keep in sync with
// LLM_PROVIDERS in lib/geo-engine.ts.
const PROVIDERS = ["ChatGPT", "Claude", "Perplexity", "Gemini", "Grok", "DeepSeek"];

const BENEFITS = [
  { icon: MousePointerClick, titleKey: "landing.benefit1Title", descKey: "landing.benefit1Desc" },
  { icon: FileDown, titleKey: "landing.benefit2Title", descKey: "landing.benefit2Desc" },
  { icon: MessageSquareText, titleKey: "landing.benefit3Title", descKey: "landing.benefit3Desc" },
] as const;

const STEPS = [
  { titleKey: "landing.step1Title", descKey: "landing.step1Desc" },
  { titleKey: "landing.step2Title", descKey: "landing.step2Desc" },
  { titleKey: "landing.step3Title", descKey: "landing.step3Desc" },
] as const;

const FAQS = [
  { qKey: "landing.faqQ1", aKey: "landing.faqA1" },
  { qKey: "landing.faqQ2", aKey: "landing.faqA2" },
  { qKey: "landing.faqQ3", aKey: "landing.faqA3" },
] as const;

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
    featureKeys: [
      "landing.proFeature1",
      "landing.proFeature2",
      "landing.proFeature3",
      "landing.proFeature4",
      "landing.proFeature5",
    ],
    highlighted: true,
  },
  {
    name: "Business",
    price: "¥29,800",
    period: "/mo",
    descKey: "landing.businessDesc",
    // businessFeature0 ("everything in Pro") gets a different
    // icon/weight below, to read as "inherits the tier below" rather
    // than just another bullet point.
    featureKeys: [
      "landing.businessFeature0",
      "landing.businessFeature1",
      "landing.businessFeature2",
      "landing.businessFeature3",
      "landing.businessFeature4",
    ],
    highlighted: false,
  },
] as const;

export default async function LandingPage() {
  // Header/CTA state must reflect whether a session already exists -
  // otherwise a logged-in user sees "Log in / Get Started" here, which
  // reads as having been signed out even though nothing changed.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const primaryHref = user ? "/dashboard" : "/login";
  const primaryLabelKey = user ? "nav.backToDashboard" : "nav.getStarted";
  // A logged-in-but-unpaid visitor goes to the real checkout flow
  // (/pricing); /pricing itself redirects paid users straight on to
  // /dashboard, so this never shows pricing to someone already paying.
  const planCtaHref = user ? "/pricing" : "/login";

  return (
    <main className="flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </Link>
          <nav className="flex items-center gap-4">
            <LangToggle />
            {user ? (
              <span className="hidden max-w-[14rem] truncate text-sm text-muted-foreground sm:inline">
                {user.email}
              </span>
            ) : (
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
                <T k="nav.login" />
              </Link>
            )}
            <Link href={primaryHref} className={cn(buttonVariants({ size: "sm" }))}>
              <T k={primaryLabelKey} />
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
          <Link href={primaryHref} className={cn(buttonVariants({ size: "lg" }))}>
            <T k={primaryLabelKey} /> <ArrowRight className="ml-2 h-4 w-4" />
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

      {/* Benefits */}
      <section className="border-t border-border py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight text-balance">
            <T k="landing.benefitsTitle" />
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <div key={benefit.titleKey} className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <benefit.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">
                  <T k={benefit.titleKey} />
                </h3>
                <p className="max-w-xs text-sm text-muted-foreground">
                  <T k={benefit.descKey} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            <T k="landing.howItWorksTitle" />
          </h2>
          <p className="mt-3 text-center text-muted-foreground">
            <T k="landing.howItWorksSubtitle" />
          </p>
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-10 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.titleKey} className="relative flex flex-col items-center gap-3 text-center">
                {i < STEPS.length - 1 && (
                  <div className="absolute left-1/2 top-5 hidden h-px w-full -translate-y-1/2 bg-border md:block" />
                )}
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </div>
                <h3 className="text-base font-semibold">
                  <T k={step.titleKey} />
                </h3>
                <p className="max-w-xs text-sm text-muted-foreground">
                  <T k={step.descKey} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border py-24">
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
          <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 pt-3 md:grid-cols-2">
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
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <T k={plan.descKey} />
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <ul className="flex flex-1 flex-col gap-2">
                    {plan.featureKeys.map((key) =>
                      key === "landing.businessFeature0" ? (
                        <li key={key} className="flex items-center gap-2 text-sm font-medium">
                          <Layers className="h-4 w-4 shrink-0 text-primary" />
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
                  <Link
                    href={planCtaHref}
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

      {/* FAQ */}
      <section className="border-t border-border bg-muted/30 py-24">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            <T k="landing.faqTitle" />
          </h2>
          <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-3">
            {FAQS.map((faq) => (
              <details key={faq.qKey} className="group rounded-lg border border-border bg-background px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:content-none">
                  <T k={faq.qKey} />
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">
                  <T k={faq.aKey} />
                </p>
              </details>
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
            <Link href={primaryHref} className="hover:text-foreground">
              <T k={user ? "nav.backToDashboard" : "nav.login"} />
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
