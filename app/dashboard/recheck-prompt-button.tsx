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
  const [error, setError] = useState<string | null>(null);

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
        // 429 (rate limited) carries a retryAfterMin so the message can
        // be built from a translated template; anything else falls back
        // to a generic translated message.
        if (data.code === "rate_limited") {
          throw new Error(t("dashboard.recheckRateLimited", { minutes: data.retryAfterMin ?? "" }));
        }
        throw new Error(t("dashboard.recheckFailed"));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.recheckFailed"));
    } finally {
      setLoading(false);
    }
  }

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
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-border bg-popover p-2 text-xs text-destructive shadow-md">
          {error}
        </p>
      )}
    </div>
  );
}
