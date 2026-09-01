import * as Sentry from "@sentry/nextjs";

/**
 * Runs once per Node.js server instance (loaded from instrumentation.ts).
 * This is the config that actually matters most for this app: Vercel's
 * own function logs are the thing that was getting lost (see the daily
 * cron job's cron_runs table, added for the same reason) - every server
 * route/action/cron run reported here survives past whatever log
 * retention window Vercel gives the Hobby plan.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
