import * as Sentry from "@sentry/nextjs";

/**
 * Runs once in the browser. NEXT_PUBLIC_SENTRY_DSN is safe to expose
 * client-side (that's what a DSN is for) - see .env.example. Left unset
 * in local dev, Sentry.init() with dsn: undefined just becomes a no-op:
 * nothing is captured or sent, no error is thrown.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // A flat 10% trace sample is enough to spot systemic slowness without
  // paying full tracing volume on every page view - this app doesn't
  // have the traffic yet where a lower/adaptive rate would matter.
  tracesSampleRate: 0.1,
  debug: false,
});
