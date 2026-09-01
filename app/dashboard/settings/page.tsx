import { Target, Bell, ShieldCheck, Palette, Mail, Settings2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/t";
import { cn } from "@/lib/utils";

import { BrandForm } from "../brand-form";
import { BrandListItem } from "../brand-list-item";
import { SlackSettingsForm } from "../slack-settings-form";
import { UpgradePrompt } from "../upgrade-button";
import { ManageSubscriptionButton } from "../manage-subscription-button";
import { WhiteLabelForm } from "./white-label-form";
import { EmailAlertsForm } from "./email-alerts-form";

const PLAN_LABELS: Record<string, string | null> = {
  free: null, // rendered via <T k="dashboard.notSubscribed" /> instead
  pro: "Pro",
  business: "Business",
};

export default async function SettingsPage({
  searchParams,
}: {
  // Set by the onboarding guide's step-3 CTA (see dashboard/page.tsx) -
  // "alerts" draws attention to the email-alerts card/test-send button
  // below, since a first-time visitor landing on a page full of cards
  // has no way to know which one the link was actually pointing at.
  searchParams: { highlight?: string };
}) {
  const highlightAlerts = searchParams.highlight === "alerts";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: brands }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("brands")
      .select("id, name, domain, competitors, is_active, created_at")
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <T k="settings.title" />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <T k="settings.subtitle" />
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Brand management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <T k="settings.brandManagement" />
            </CardTitle>
            <CardDescription>
              <T k="settings.brandManagementDesc" />
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {brands && brands.length > 0 && (
              <ul className="flex flex-col gap-3">
                {brands.map((brand) => (
                  <li key={brand.id}>
                    <BrandListItem brand={brand} />
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium">
                <T k="settings.addBrand" />
              </p>
              {(profile?.plan ?? "free") === "free" ? (
                <p className="text-sm text-muted-foreground">
                  <T k="settings.addBrandNeedsPlan" />
                </p>
              ) : (
                <BrandForm businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Email alerts - the default/primary notification channel */}
        <Card
          id="email-alerts"
          className={cn(highlightAlerts && "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/20")}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <T k="settings.emailAlertsTitle" />
            </CardTitle>
            <CardDescription>
              <T k="settings.emailAlertsDesc" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailAlertsForm
              initialEmail={profile?.notification_email ?? profile?.email ?? user.email ?? ""}
              initialEnabled={profile?.email_alerts_enabled ?? true}
              highlightTestButton={highlightAlerts}
            />
          </CardContent>
        </Card>

        {/* White-label report branding - Business plan only */}
        {(profile?.plan ?? "free") === "business" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <T k="settings.whiteLabelTitle" />
              </CardTitle>
              <CardDescription>
                <T k="settings.whiteLabelDesc" />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WhiteLabelForm
                initialLogoUrl={profile?.report_logo_url ?? null}
                initialCompanyName={profile?.company_name ?? null}
              />
            </CardContent>
          </Card>
        )}

        {/* Plan / upgrade */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <T k="dashboard.plan" />
            </CardTitle>
            <CardDescription>
              <T k="settings.currentPlan" />:{" "}
              {PLAN_LABELS[profile?.plan ?? "free"] ?? profile?.plan ?? <T k="dashboard.notSubscribed" />}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(profile?.plan ?? "free") === "free" && (
              <UpgradePrompt
                proPriceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
                businessPriceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
              />
            )}
            {(profile?.plan ?? "free") !== "free" && (
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

      {/* Advanced/optional integrations - deliberately separated from the
          main settings grid above and pushed to the very bottom: Slack
          is an additional channel now, not the primary one (see
          EmailAlertsForm above), so it shouldn't compete for attention
          with the settings most people actually need. */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          <T k="settings.advancedSectionTitle" />
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <T k="settings.slackSettings" />
            </CardTitle>
            <CardDescription>
              <T k="settings.slackSettingsDesc" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SlackSettingsForm
              initialWebhookUrl={profile?.slack_webhook_url ?? null}
              initialEnabled={profile?.slack_enabled ?? false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
