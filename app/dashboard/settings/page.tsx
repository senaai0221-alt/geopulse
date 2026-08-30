import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/t";

import { BrandForm } from "../brand-form";
import { BrandListItem } from "../brand-list-item";
import { SlackSettingsForm } from "../slack-settings-form";
import { UpgradePrompt } from "../upgrade-button";
import { ManageSubscriptionButton } from "../manage-subscription-button";

const PLAN_LABELS: Record<string, string | null> = {
  free: null, // rendered via <T k="dashboard.notSubscribed" /> instead
  pro: "Pro",
  business: "Business",
};

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: brands }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("brands")
      .select("id, name, domain, competitors, created_at")
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
            <CardTitle>
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
                <BrandForm />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Slack settings */}
        <Card>
          <CardHeader>
            <CardTitle>
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

        {/* Plan / upgrade */}
        <Card>
          <CardHeader>
            <CardTitle>
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
    </div>
  );
}
