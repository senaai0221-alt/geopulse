import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { T } from "@/components/t";

import { SlackSettingsForm } from "../slack-settings-form";

/**
 * Split out of /dashboard/settings's "上級者向けオプション連携" section
 * (2026-09, "ナビゲーション・タブの独立・再構築") into its own route -
 * Slack is the only integration today, but this page (not "設定") is
 * where a second one would go, kept separate from account/brand
 * settings the same way it was visually separated as settings/
 * page.tsx's own "advanced, pushed to the bottom" section before this
 * split. i18n keys stay under the "settings" namespace
 * (settings.slackSettings etc.) - reused directly as this page's own
 * h1/subtitle rather than adding new, near-duplicate strings.
 */
export default async function IntegrationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("slack_webhook_url, slack_enabled")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <T k="settings.slackSettings" />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <T k="settings.slackSettingsDesc" />
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SlackSettingsForm
            initialWebhookUrl={profile?.slack_webhook_url ?? null}
            initialEnabled={profile?.slack_enabled ?? false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
