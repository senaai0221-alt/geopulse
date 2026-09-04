import { Target, Palette, Mail } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/components/t";
import { cn } from "@/lib/utils";

import { BrandForm } from "../brand-form";
import { BrandListItem } from "../brand-list-item";
import { WhiteLabelForm } from "./white-label-form";
import { EmailAlertsForm } from "./email-alerts-form";

export default async function SettingsPage({
  searchParams,
}: {
  // Set by the onboarding guide's step-3 CTA (see dashboard/page.tsx) -
  // "alerts" draws attention to the email-alerts card/test-send button
  // below, since a first-time visitor landing on a page full of cards
  // has no way to know which one the link was actually pointing at.
  // `brand` is the same idea for one specific brand's edit form - set by
  // the Share of Voice card's "＋ライバルを追加" link (components/
  // share-of-voice.tsx) when a brand has no rivals registered yet, so
  // that CTA lands the reader directly in the right open, highlighted
  // form instead of a settings page full of cards they'd have to
  // search themselves.
  searchParams: { highlight?: string; brand?: string };
}) {
  const highlightAlerts = searchParams.highlight === "alerts";
  const focusBrandId = searchParams.brand;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: brands }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("brands")
      .select("id, name, domain, aliases, competitors, is_active, created_at")
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
                    <BrandListItem brand={brand} autoFocus={brand.id === focusBrandId} />
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
      </div>
    </div>
  );
}
