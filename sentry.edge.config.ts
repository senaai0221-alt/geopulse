import * as Sentry from "@sentry/nextjs";

/**
 * Runs for anything on the Edge runtime - middleware.ts, primarily
 * (the auth session refresh / paywall redirect on every request).
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
