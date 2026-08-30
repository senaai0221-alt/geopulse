"use client";

import { UserPlus, MessageSquarePlus, Sparkles, ChevronDown } from "lucide-react";

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

const FAQS = [
  { qKey: "help.faqQ1", aKey: "help.faqA1" },
  { qKey: "help.faqQ2", aKey: "help.faqA2" },
  { qKey: "help.faqQ3", aKey: "help.faqA3" },
] as const;

/** Self-serve guide/FAQ - lets a non-engineer answer their own "how do
 *  I..." and "what does this number mean" questions without emailing
 *  support, and doubles as onboarding for a brand-new subscriber. */
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
          <CardTitle>{t("help.quickStartTitle")}</CardTitle>
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
          <CardTitle>{t("help.metricsTitle")}</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>{t("help.faqTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {FAQS.map((faq) => (
            <details key={faq.qKey} className="group rounded-lg border border-border px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-slate-900 marker:content-none">
                {t(faq.qKey)}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{t(faq.aKey)}</p>
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
