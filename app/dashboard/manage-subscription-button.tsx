"use client";

import { useState } from "react";
import { Loader2, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useI18n } from "@/lib/i18n/context";

/** Sends the user to the Stripe-hosted Billing Portal for self-serve
 *  cancellation, payment method updates, and invoice/receipt downloads. */
export function ManageSubscriptionButton() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        // The API returns a code (not a locale-specific message - it
        // has no idea which language this UI is in), so map it here.
        const key = data.error === "no_customer" ? "settings.portalNoCustomer" : "settings.portalError";
        throw new Error(t(key));
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.portalError"));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={loading} variant="outline" size="sm">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
        {t("settings.manageSubscription")}
      </Button>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
