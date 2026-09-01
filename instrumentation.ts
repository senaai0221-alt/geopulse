import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook (requires experimental.instrumentationHook
 * in next.config.mjs on this Next 14.2 version - stable by default from
 * Next 15). Loads the runtime-appropriate Sentry config exactly once per
 * server/edge instance, before any route/middleware code runs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forwards any error Next.js catches while rendering a Server Component,
// Route Handler, or Server Action - the automatic counterpart to the
// explicit Sentry.captureException calls added to the webhook/checkout/
// cron routes' own catch blocks, for everything that ISN'T caught by
// hand. Complements, doesn't replace, those explicit calls: a route that
// already catches and logs its own error never reaches Next's own
// error-reporting path at all.
export const onRequestError = Sentry.captureRequestError;
