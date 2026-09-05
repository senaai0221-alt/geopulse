"use client";

import { HelpCircle, ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/context";

// Grouped by category (2026-09) - a flat list of 6 questions read fine
// at 4, but stopped being scannable once the two "is this even worth
// it" questions below (faqQ5/Q6) were added for a prospective
// subscriber still evaluating the product, not just an existing one
// looking up a feature. Order within each category is deliberate: the
// two hardest objections come first in "計測の仕組み", right where a
// skeptical reader actually starts reading, rather than buried after
// the more mundane operational questions.
const FAQ_CATEGORIES = [
  {
    titleKey: "help.faqCategoryMechanics",
    items: [
      { qKey: "help.faqQ5", aKey: "help.faqA5" },
      { qKey: "help.faqQ6", aKey: "help.faqA6" },
      { qKey: "help.faqQ1", aKey: "help.faqA1" },
      { qKey: "help.faqQ2", aKey: "help.faqA2" },
    ],
  },
  {
    titleKey: "help.faqCategoryMetrics",
    items: [{ qKey: "help.faqQ4", aKey: "help.faqA4" }],
  },
  {
    titleKey: "help.faqCategoryBilling",
    items: [{ qKey: "help.faqQ3", aKey: "help.faqA3" }],
  },
] as const;

/**
 * Split out of /dashboard/help (2026-09, "ナビゲーション・タブの独立・
 * 再構築") into its own route - previously the bottom section of a
 * combined "ガイド・Q&A" page, reachable only by scrolling past the
 * quick-start guide and metrics glossary first. i18n keys stay under
 * the "help" namespace (help.faqQ1 etc.) - moving which page renders a
 * string doesn't require renaming the string itself.
 */
export default function FaqPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("help.faqPageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("help.faqPageSubtitle")}</p>
      </div>

      {FAQ_CATEGORIES.map((category) => (
        <Card key={category.titleKey}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              {t(category.titleKey)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {category.items.map((faq) => (
              <details key={faq.qKey} className="group rounded-lg border border-border px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-slate-900 marker:content-none">
                  <span className="flex items-center gap-2">
                    <HelpCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {t(faq.qKey)}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{t(faq.aKey)}</p>
              </details>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
