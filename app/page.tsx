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
  HelpCircle,
  TrendingUp,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { T } from "@/components/t";
import { LangToggle } from "@/components/lang-toggle";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { createClient } from "@/lib/supabase/server";
import { TRIAL_PERIOD_DAYS } from "@/lib/stripe";

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
    // Matches /pricing's own isTrialEligible/TRIAL_PERIOD_DAYS gating
    // (Pro-only, first-ever Stripe customer only - see lib/stripe.ts).
    // A first-time visitor here can't have eligibility checked without
    // an account yet, so this advertises the trial the same qualified
    // way /pricing's own subtitleTrial already does ("初めてのご利用な
    // ら...") rather than an unconditional promise - true for the
    // overwhelming majority of people landing on a marketing page for
    // the first time, and never actually wrong: someone who turns out
    // ineligible simply sees the plain "subscribe now" checkout instead,
    // exactly like a returning /pricing visitor already does.
    offersTrial: true,
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
      "landing.businessFeature3Note",
      "landing.businessFeature4",
    ],
    highlighted: false,
    offersTrial: false,
  },
] as const;

// Rendered as a muted caveat line (no checkmark) rather than a feature
// bullet - businessFeature3Note is the white-label disclaimer split out
// of businessFeature3 itself (2026-09, "料金プランの表記統一") so that
// bullet stays as short as the other benefit-worded ones instead of
// running two sentences together; businessFeature4 is the pre-existing
// "need more than 80 prompts" caveat. Shared with app/pricing/page.tsx,
// which renders the exact same PLANS/featureKeys shape.
const NOTE_FEATURE_KEYS = new Set(["landing.businessFeature3Note", "landing.businessFeature4"]);

export default async function LandingPage() {
  // Header/CTA state must reflect whether a session already exists -
  // otherwise a logged-in user sees "Log in / Get Started" here, which
  // reads as having been signed out even though nothing changed.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // "今すぐ始める"/getStarted always means signup-framing on /login (see
  // login-form.tsx's own readMode) - there's no separate signup flow to
  // send it to instead (Google/email OTP both create an account on
  // first use), but the CTA's own wording still shouldn't land on a
  // page that opens on the "ログイン" tab.
  const primaryHref = user ? "/dashboard" : "/login?mode=signup";
  const primaryLabelKey = user ? "nav.backToDashboard" : "nav.getStarted";

  return (
    <main className="flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Zonostick
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            {/* Below `sm`, this row alone (logo + lang toggle + login
                link + CTA) overran a 375px viewport - see
                MarketingMobileNav's own comment. The lang toggle and
                login/email move into that overflow menu below `sm`;
                the CTA stays put at every width since it's the one
                thing worth never hiding behind a tap. */}
            <div className="hidden items-center gap-4 sm:flex">
              <LangToggle />
              {user ? (
                <span className="max-w-[14rem] truncate text-sm text-muted-foreground">{user.email}</span>
              ) : (
                <Link href="/login?mode=login" className="text-sm text-muted-foreground hover:text-foreground">
                  <T k="nav.login" />
                </Link>
              )}
            </div>
            <MarketingMobileNav userEmail={user?.email ?? null} />
            <Link href={primaryHref} className={cn(buttonVariants({ size: "sm" }))}>
              <T k={primaryLabelKey} />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-24 text-center">
        {/* Aurora/mesh background - decorative only, scoped to this
            hero (see globals.css's .hero-aurora-* comment for why this
            is a deliberate, contained exception to DESIGN.md's "quiet
            confidence" rule rather than a silent departure from it).
            -z-10 keeps it behind every piece of real content; aria-hidden
            + pointer-events-none because it carries no information and
            must never intercept a click meant for the CTA below it. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="hero-aurora-1 absolute -top-32 left-1/2 h-[28rem] w-[28rem] -translate-x-[70%] rounded-full bg-primary/25 blur-3xl" />
          <div className="hero-aurora-2 absolute top-10 right-0 h-96 w-96 translate-x-1/3 rounded-full bg-violet-400/20 blur-3xl" />
          <div className="hero-aurora-3 absolute top-40 left-0 h-80 w-80 -translate-x-1/3 rounded-full bg-pink-300/15 blur-3xl" />
        </div>

        <div className="container">
          <Badge variant="secondary" className="mb-4">
            <T k="landing.badge" />
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            <T k="landing.heroTitle1" />
            <br />
            <T k="landing.heroTitle2" />
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            <T k="landing.heroDescription" />
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href={primaryHref}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-14 gap-1 rounded-xl bg-gradient-to-r from-primary to-violet-500 px-10 text-base shadow-lg shadow-primary/25 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/35"
              )}
            >
              <T k={primaryLabelKey} /> <ArrowRight className="ml-1 h-5 w-5" />
            </Link>
            <Link href="#pricing" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              <T k="landing.viewPricing" />
            </Link>
          </div>

          {/* Product UI mockup - hand-built from the same design tokens
              as the real dashboard (Card/Badge/color vars), not a
              screenshot: it can never go stale against the real UI and
              needs no image asset. Labels reuse the exact KPI names from
              the terminology-unification pass (AIでの表示率/AIおすすめ率/
              平均表示順位) and the A/B/C-company convention already used
              in onboarding's placeholder copy. */}
          <div className="relative z-10 mx-auto mt-16 max-w-2xl overflow-hidden rounded-2xl border border-border bg-card text-left shadow-2xl shadow-primary/10">
            <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="mx-auto flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                <T k="landing.mockupUrlBar" />
              </div>
            </div>
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    <T k="landing.mockupKpi1Label" />
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xl font-bold text-foreground">
                    78% <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    <T k="landing.mockupKpi2Label" />
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xl font-bold text-foreground">
                    64% <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    <T k="landing.mockupKpi3Label" />
                  </p>
                  <p className="mt-1 text-xl font-bold text-foreground">#2.3</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MessageSquareText className="h-3.5 w-3.5" />
                  <T k="landing.mockupResponseLabel" />
                </p>
                <ol className="flex flex-col gap-1.5 text-sm">
                  <li className="text-muted-foreground">
                    1. <T k="landing.mockupBrandB" />
                  </li>
                  <li className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">
                    2. <T k="landing.mockupBrandSelf" />
                    <Badge className="ml-auto">#2</Badge>
                  </li>
                  <li className="text-muted-foreground">
                    3. <T k="landing.mockupBrandC" />
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            {PROVIDERS.map((p) => (
              <Badge key={p} variant="outline" className="px-4 py-1.5 text-sm">
                {p}
              </Badge>
            ))}
          </div>
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
            {PLANS.map((plan) => {
              // Carries which specific plan was clicked through to
              // wherever it lands next, so the visitor never has to
              // re-find "the Business one" on a generic list -
              // /pricing?plan= highlights the matching card (see that
              // page's own comment on why this is presentational only,
              // never an auto-checkout). A logged-in-but-unpaid visitor
              // skips /login entirely and goes straight to /pricing;
              // a guest goes through /login first, with /pricing?plan=
              // as its `next` so the highlight still applies once
              // they're back.
              const planKey = plan.name.toLowerCase();
              const pricingHref = `/pricing?plan=${planKey}`;
              const planCtaHref = user
                ? pricingHref
                : `/login?mode=signup&next=${encodeURIComponent(pricingHref)}`;
              return (
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
                  {plan.offersTrial && (
                    // Same badge/copy as /pricing's own (post-login,
                    // eligibility-checked) trial callout - see the PLANS
                    // entry's own comment on why advertising it here,
                    // pre-login, is still accurate.
                    <Badge variant="secondary" className="w-fit">
                      <T k="pricing.trialBadge" vars={{ days: TRIAL_PERIOD_DAYS }} />
                    </Badge>
                  )}
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
                      ) : NOTE_FEATURE_KEYS.has(key) ? (
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
                  <Link
                    href={planCtaHref}
                    className={cn(
                      buttonVariants({ variant: plan.highlighted ? "default" : "outline" }),
                      "w-full"
                    )}
                  >
                    {plan.offersTrial ? (
                      <T k="pricing.ctaProTrial" vars={{ days: TRIAL_PERIOD_DAYS }} />
                    ) : (
                      <T k="nav.getStarted" />
                    )}
                  </Link>
                  {plan.offersTrial && (
                    <p className="text-center text-xs text-muted-foreground">
                      <T k="pricing.trialNote" />
                    </p>
                  )}
                </CardContent>
              </Card>
              );
            })}
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
                  <span className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                    <T k={faq.qKey} />
                  </span>
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
