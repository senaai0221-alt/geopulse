"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { UpgradeButton } from "./upgrade-button";

/**
 * Renders a plan-limit error (no_free_tier / brand_limit:N /
 * prompt_limit:N - the codes assertCanAddBrand/assertCanAddPrompt throw,
 * see lib/plan-limits.ts) as more than plain text: a direct one-click
 * path to actually resolve it, not just a dead-end error message.
 * - no_free_tier: the caller has no subscription yet, so there's no
 *   plan-specific checkout to send them straight into - link to
 *   /pricing to choose one.
 * - brand_limit / prompt_limit: the caller is already on Pro and hit its
 *   cap - one click straight into Business Stripe Checkout, no detour
 *   through the pricing page to re-pick a plan they're already past.
 * Returns null for anything else (a regular error, not a plan-limit
 * one) so the caller's normal InlineAlert renders instead.
 */
export function PlanLimitAlert({
  code,
  businessPriceId,
}: {
  code: string;
  businessPriceId: string;
}) {
  const { t } = useI18n();
  const [type, param] = code.split(":");

  const message =
    type === "no_free_tier"
      ? t("settings.noFreeTier")
      : type === "brand_limit"
      ? t("settings.brandLimitReached", { max: param ?? "" })
      : type === "prompt_limit"
      ? t("dashboard.promptLimitReached", { max: param ?? "" })
      : null;

  if (!message) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {type === "no_free_tier" ? (
        <Link href="/pricing" className={buttonVariants({ size: "sm", className: "w-fit" })}>
          {t("nav.pricingPlan")}
        </Link>
      ) : (
        <UpgradeButton priceId={businessPriceId} label={t("dashboard.upgradeToBusiness")} size="sm" />
      )}
    </div>
  );
}
