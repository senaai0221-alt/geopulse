import { Globe, Tag } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { BrandForm } from "../brand-form";
import { SlackSettingsForm } from "../slack-settings-form";
import { UpgradeButton } from "../upgrade-button";

const PLAN_DISPLAY_LABELS: Record<string, string> = {
  free: "未契約",
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
        <h1 className="text-2xl font-bold tracking-tight">設定・連携</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ブランド管理、Slack通知、ご契約プランをこちらで設定します。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Brand management */}
        <Card>
          <CardHeader>
            <CardTitle>ブランド管理</CardTitle>
            <CardDescription>追跡するブランドの一覧と追加</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {brands && brands.length > 0 && (
              <ul className="flex flex-col gap-3">
                {brands.map((brand) => (
                  <li
                    key={brand.id}
                    className="flex flex-col gap-1.5 rounded-md border border-border p-3"
                  >
                    <span className="font-medium">{brand.name}</span>
                    {brand.domain && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Globe className="h-3 w-3" />
                        {brand.domain}
                      </span>
                    )}
                    {brand.competitors && brand.competitors.length > 0 && (
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Tag className="h-3 w-3 shrink-0" />
                        {brand.competitors.map((c: string) => (
                          <Badge key={c} variant="outline" className="text-[11px]">
                            {c}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-medium">新しいブランドを追加</p>
              {(profile?.plan ?? "free") === "free" ? (
                <p className="text-sm text-muted-foreground">
                  ブランドの追加には有料プラン(Pro/Business)のご契約が必要です。右のカードからご契約いただけます。
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
            <CardTitle>Slack通知設定</CardTitle>
            <CardDescription>日次サマリーと異常検知アラートの送信先</CardDescription>
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
            <CardTitle>プラン</CardTitle>
            <CardDescription>
              現在のプラン: {PLAN_DISPLAY_LABELS[profile?.plan ?? "free"] ?? profile?.plan}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(profile?.plan ?? "free") === "free" && (
              <>
                <UpgradeButton
                  priceId={process.env.STRIPE_PRICE_ID_PRO ?? ""}
                  label="Proにアップグレード"
                />
                <UpgradeButton
                  priceId={process.env.STRIPE_PRICE_ID_BUSINESS ?? ""}
                  label="Businessにアップグレード"
                />
              </>
            )}
            {(profile?.plan ?? "free") !== "free" && (
              <p className="text-sm text-muted-foreground">
                ご契約ありがとうございます。プラン変更はサポートまでご連絡ください。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
