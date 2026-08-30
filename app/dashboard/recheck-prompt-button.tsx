"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RecheckPromptButton({ promptId }: { promptId: string }) {
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
        // 429 (rate limited) has a friendly, ready-to-show message from
        // the API; anything else falls back to a generic one.
        throw new Error(data.error ?? "再計測に失敗しました");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "再計測に失敗しました");
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
        aria-label="今すぐ再計測"
        title="今すぐ再計測(1時間に1回まで)"
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
