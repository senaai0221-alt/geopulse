import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Enables instrumentation.ts (default-on from Next 15; still gated
    // behind this flag on 14.2) - Sentry's server/edge init and the
    // onRequestError hook both live there.
    instrumentationHook: true,
  },
};

// Wraps the build to upload source maps and set up the tunnel route.
// Entirely opt-in via env vars: with SENTRY_AUTH_TOKEN unset (e.g. any
// local dev build), the plugin just skips the upload step instead of
// failing the build - see .env.example for what to set in Vercel.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
