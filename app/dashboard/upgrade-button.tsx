"use client";

import { useState } from "react";
import { Loader2, Rocket } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useI18n } from "@/lib/i18n/context";

export function UpgradeButton({
  priceId,
  label,
  size = "sm",
  className,
}: {
  priceId: string;
  label: string;
  size?: ButtonProps["size"];
  className?: string;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  // A boolean, not the message text itself, so the alert always renders
  // in the *current* locale even if the viewer flips the JA/EN toggle
  // after the error appears.
  const [hasError, setHasError] = useState(false);

  async function handleClick() {
    setLoading(true);
    setHasError(false);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error("checkout_create_failed");
      }
      window.location.href = data.url;
    } catch {
      setHasError(true);
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={loading} size={size} className={className}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
        {label}
      </Button>
      {hasError && <InlineAlert>{t("dashboard.genericError")}</InlineAlert>}
    </div>
  );
}

/** The pair of Pro/Business upgrade buttons shown wherever a free-plan
 *  user needs to be routed to Stripe Checkout (dashboard empty states,
 *  settings). Kept together so the translated labels live in one place.
 *  Price IDs are server-only env vars, so the caller (a Server
 *  Component) must resolve and pass them in - a Client Component can't
 *  read process.env.STRIPE_PRICE_ID_* itself. */
export function UpgradePrompt({
  proPriceId,
  businessPriceId,
  currentPlan,
}: {
  proPriceId: string;
  businessPriceId: string;
  /** The caller's current plan, if any. A Pro (or Business) subscriber is
   *  never offered the Pro button - upgrading from Pro to Pro is not a
   *  real option, and showing it anyway reads as a bug (see the report
   *  page's Business-only gate, which used to show both). */
  currentPlan?: string | null;
}) {
  const { t } = useI18n();
  const showPro = currentPlan !== "pro" && currentPlan !== "business";
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {showPro && <UpgradeButton priceId={proPriceId} label={t("dashboard.upgradeToPro")} />}
      <UpgradeButton priceId={businessPriceId} label={t("dashboard.upgradeToBusiness")} />
    </div>
  );
}
