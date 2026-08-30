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
  // The API returns a code (it has no idea which language this UI is
  // in), stored as-is and translated at render time (see `error` below)
  // - not pre-translated into `error` directly - so if the viewer
  // switches the JA/EN toggle while this is showing, it re-translates
  // immediately instead of staying stuck in the old language.
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setErrorCode(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setErrorCode(data.error === "no_customer" ? "no_customer" : "portal_error");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setErrorCode("portal_error");
      setLoading(false);
    }
  }

  const error = errorCode
    ? t(errorCode === "no_customer" ? "settings.portalNoCustomer" : "settings.portalError")
    : null;

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
