"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export function RecheckPromptButton({ promptId }: { promptId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Kept as data (a rate-limit flag + the raw minutes), not the rendered
  // message text, so the popover always re-translates correctly if the
  // viewer flips the JA/EN toggle while it's showing.
  const [error, setError] = useState<{ rateLimited: boolean; minutes?: number } | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prompts/check-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "rate_limited") {
          setError({ rateLimited: true, minutes: data.retryAfterMin });
        } else {
          setError({ rateLimited: false });
        }
        return;
      }
      router.refresh();
    } catch {
      setError({ rateLimited: false });
    } finally {
      setLoading(false);
    }
  }

  const errorText = error
    ? error.rateLimited
      ? t("dashboard.recheckRateLimited", { minutes: error.minutes ?? "" })
      : t("dashboard.recheckFailed")
    : null;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("dashboard.recheckAriaLabel")}
        title={t("dashboard.recheckTitle")}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
      {errorText && (
        <p className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-border bg-popover p-2 text-xs text-destructive shadow-md">
          {errorText}
        </p>
      )}
    </div>
  );
}
