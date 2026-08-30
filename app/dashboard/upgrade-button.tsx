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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "決済ページの作成に失敗しました");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={loading} size={size} className={className}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
        {label}
      </Button>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}

/** The pair of Pro/Business upgrade buttons shown wherever a free-plan
 *  user needs to be routed to Stripe Checkout (dashboard empty states,
 *  settings). Kept together so the translated labels live in one place.
 *  Price IDs are server-only env vars, so the caller (a Server
 *  Component) must resolve and pass them in - a Client Component can't
 *  read process.env.STRIPE_PRICE_ID_* itself. */
export function UpgradePrompt({ proPriceId, businessPriceId }: { proPriceId: string; businessPriceId: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <UpgradeButton priceId={proPriceId} label={t("dashboard.upgradeToPro")} />
      <UpgradeButton priceId={businessPriceId} label={t("dashboard.upgradeToBusiness")} />
    </div>
  );
}
