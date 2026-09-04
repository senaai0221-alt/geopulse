"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";
import { FeedbackForm } from "./feedback-form";

/**
 * Split out of /dashboard/settings's "上級者向けオプション連携" area is
 * NOT where this lived - it was the bottom card of /dashboard/help
 * (2026-09, "ナビゲーション・タブの独立・再構築"). Given its own route
 * (rather than "設定"/"連携") because it isn't account configuration -
 * it's a one-off message to the operator, closer in kind to
 * ガイド/よくある質問 than to anything with saved state. No separate
 * CardHeader/title here (unlike its old home, where it was one of
 * several cards on a shared page and needed its own label to stand
 * out) - the page's own h1 already says exactly this.
 */
export default function ContactPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("feedback.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("feedback.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <FeedbackForm />
        </CardContent>
      </Card>
    </div>
  );
}
