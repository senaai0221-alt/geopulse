"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 1500;
// Webhooks normally land in well under this; past it we assume something
// is unusually slow (or stuck) and stop auto-retrying so the tab doesn't
// poll forever, offering a manual way forward instead.
const TIMEOUT_MS = 30_000;

type State = "polling" | "confirmed" | "timed_out";

/**
 * Polls /api/checkout/status until profiles.plan reflects the plan the
 * user just paid for (updated asynchronously by the Stripe webhook),
 * then sends them on to /dashboard - see app/api/checkout/route.ts for
 * why this indirection exists instead of redirecting there directly.
 */
export function CheckoutPolling() {
  const [state, setState] = useState<State>("polling");
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch("/api/checkout/status", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        if (data.plan === "pro" || data.plan === "business") {
          setState("confirmed");
          window.location.href = "/dashboard";
          return;
        }
      } catch {
        // Transient network error - just try again on the next tick.
      }

      if (cancelled) return;
      if (Date.now() - startedAt.current > TIMEOUT_MS) {
        setState("timed_out");
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (state === "timed_out") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm text-muted-foreground">
          決済の反映にいつもより時間がかかっています。決済自体は完了している可能性が高いです。
          <br />
          少し時間を置いてから、もう一度お試しください。
        </p>
        <Button onClick={() => window.location.reload()} size="sm" className="mt-1">
          もう一度確認する
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {state === "confirmed" ? (
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
      ) : (
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      )}
      <p className="text-sm text-muted-foreground">
        決済を確認しています…このまま数秒お待ちください。
      </p>
    </div>
  );
}
