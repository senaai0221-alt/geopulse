"use client";

import { UserPlus, MessageSquarePlus, Sparkles, Rocket, Sliders } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";

const QUICK_START = [
  { icon: UserPlus, titleKey: "help.quickStart1Title", descKey: "help.quickStart1Desc" },
  { icon: MessageSquarePlus, titleKey: "help.quickStart2Title", descKey: "help.quickStart2Desc" },
  { icon: Sparkles, titleKey: "help.quickStart3Title", descKey: "help.quickStart3Desc" },
] as const;

const METRICS = [
  { titleKey: "help.metricsMentionTitle", descKey: "help.metricsMentionDesc" },
  { titleKey: "help.metricsRankTitle", descKey: "help.metricsRankDesc" },
  { titleKey: "help.metricsShareTitle", descKey: "help.metricsShareDesc" },
] as const;

/** Self-serve usage guide - lets a non-engineer answer their own "how
 *  do I..." and "what does this number mean" questions without
 *  emailing support, and doubles as onboarding for a brand-new
 *  subscriber. FAQ (/dashboard/faq) and the feedback form
 *  (/dashboard/contact) used to live on this same page - split into
 *  their own routes (2026-09, "ナビゲーション・タブの独立・再構築") so
 *  each is a real, independently-reachable destination from the nav
 *  instead of a scroll-down section of a combined "ガイド・Q&A" page. */
export default function HelpPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("help.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("help.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-primary" />
            {t("help.quickStartTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {QUICK_START.map((step, i) => (
              <div key={step.titleKey} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </div>
                  <step.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{t(step.titleKey)}</h3>
                <p className="text-xs text-muted-foreground">{t(step.descKey)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            {t("help.metricsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {METRICS.map((metric) => (
            <div key={metric.titleKey} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <h3 className="text-sm font-semibold text-slate-900">{t(metric.titleKey)}</h3>
              <p className="text-xs text-muted-foreground">{t(metric.descKey)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
