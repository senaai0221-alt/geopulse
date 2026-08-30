# Zonostick — Implementation Status

Last scanned: 2026-08-31. This file is a snapshot for syncing external
collaborators/AI partners with the actual codebase state — re-scan
before trusting it if significant time has passed.

Legend: ✅ Done · 🚧 Partial · ❌ Not started

## 1. Legal & Billing

| Item | Status | Files |
|---|---|---|
| Terms of Service | ✅ | `app/legal/terms/page.tsx` |
| Privacy Policy | ✅ | `app/legal/privacy/page.tsx` |
| Tokushoho (特定商取引法) disclosure | ✅ | `app/legal/tokushoho/page.tsx` |
| Stripe Checkout (subscription) | ✅ | `app/api/checkout/route.ts` |
| Stripe webhook → `profiles.plan` sync | ✅ | `app/api/webhooks/stripe/route.ts`, `lib/stripe.ts` |
| Stripe production mode | ✅ | Activated 2026-08-30; under Stripe review for the security-checklist submission (see memory) |
| Customer Portal (self-serve cancel/payment method/invoices) | ❌ | Not implemented. `app/dashboard/settings/page.tsx` currently just says "contact support to change plan" |
| Free tier | N/A — removed | `lib/plan-limits.ts` (0 brands/prompts on the `free` tier; see decision log below) |

**Gap to flag**: no Stripe Customer Portal link exists yet. Paying customers cannot self-serve cancel, update their card, or download a receipt/invoice — everything currently requires emailing support. Not blocking launch, but should be prioritized soon after.

## 2. Auth & Onboarding

| Item | Status | Files |
|---|---|---|
| Google OAuth + email magic-link/OTP login | ✅ | `app/login/page.tsx` |
| Paywall guard (unpaid users blocked from `/dashboard/*`) | ✅ | `middleware.ts` (redirects to `/pricing`) |
| `/pricing` plan-selection page | ✅ | `app/pricing/page.tsx` |
| Checkout→dashboard sync-lag handling | ✅ | `app/checkout/complete/*`, `app/api/checkout/status/route.ts` (polls `profiles.plan` before redirecting to `/dashboard`) |
| Instant first-time measurement on new prompt | ✅ | `app/api/prompts/check-now/route.ts`, wired from `app/dashboard/prompt-form.tsx` |
| First-measurement status UI ("計測中" spinner) | ✅ | `app/dashboard/page.tsx` (per-cell, based on whether the prompt has any ranking row yet) |

## 3. Core Product

| Item | Status | Files |
|---|---|---|
| 6-provider LLM integration (ChatGPT/Claude/Perplexity/Gemini/Grok/DeepSeek) | ✅ | `lib/geo-engine.ts` |
| Per-provider failure isolation | ✅ | `runGeoQuery()` uses `Promise.allSettled`; one provider erroring never blocks the others |
| Per-brand / per-prompt failure isolation in the daily batch | ✅ | `app/api/cron/daily-check/route.ts` (try/catch around each brand and each prompt) |
| Cron timeout protection (Vercel Hobby 60s cap) | ✅ | Same file: bounded concurrency (4 brands at a time) + a 45s time budget that stops starting new brands, returning cleanly instead of risking a hard kill |
| Manual re-check rate limiting | ✅ | `prompts.last_checked_at` column + 1-check-per-hour guard in `check-now`; manual button in `app/dashboard/recheck-prompt-button.tsx` |
| CSV export | ✅ | `app/api/export/csv/route.ts` |
| External job queue (Upstash QStash/Inngest) | ❌ — deliberately out of scope | Decided unnecessary at current scale; the concurrency+time-budget approach above covers it. Revisit only if real usage outgrows it. |

## 4. Frontend / UX

| Item | Status | Files |
|---|---|---|
| i18n (EN default, JA toggle) | ✅ (broad, not 100%) | `lib/i18n/context.tsx`, `locales/en.json`, `locales/ja.json`, `components/lang-toggle.tsx`, `components/t.tsx`. Applied to: landing page, login, dashboard (KPIs/table/alerts/empty states), sidebar, settings, pricing. **Not translated**: legal pages (Terms/Privacy/Tokushoho — left Japanese-only deliberately, translating legal text carries real accuracy risk) |
| Server Component error boundary (no raw Next.js error screen) | ✅ | `app/error.tsx`, `app/global-error.tsx` (root-layout-level fallback) |
| Alert-card styling for form/action errors | ✅ | `components/ui/inline-alert.tsx`, applied to login/brand/prompt/upgrade forms |
| iOS Safari input-zoom fix (16px inputs) | ✅ | `components/ui/input.tsx` (`text-base`/16px on mobile), `app/globals.css` (`!important` safety net for any input/textarea/select) |
| Viewport meta (`maximumScale: 1`) | ✅ | `app/layout.tsx` (`export const viewport`) |
| Horizontal-overflow protection | ✅ | `app/globals.css` (`overflow-x: hidden` + `max-width: 100%` on html/body) |
| Zero-mention (0% mention rate) empty-state warning + GEO tips | ✅ | `app/dashboard/page.tsx` |
| Raw LLM response viewer (modal) | ✅ | `app/dashboard/result-cell.tsx` (`RawResponseButton`) |

## 5. Backend / DB

| Item | Status | Files |
|---|---|---|
| Supabase schema (profiles/brands/prompts/rankings/alerts + RLS) | ✅ | `supabase/schema.sql` |
| 30-day data retention cleanup | ✅ | `app/api/cron/cleanup-old-rankings/route.ts`, scheduled weekly in `vercel.json`. Nulls `raw_response`/`error` on rows older than 30 days; keeps all numeric/boolean columns the charts need |
| Rebrand (GEOPulse → Zonostick) | ✅ | Domain `zonostick.com`, all app copy, Stripe product names |

## Pending manual steps (not code — need to be run/verified by the operator)

- [ ] Run in Supabase SQL Editor if not already done:
  ```sql
  alter table public.prompts add column if not exists last_checked_at timestamptz;
  ```
  (Required for the manual-recheck rate limit — `check-now` will error without it.)
- [ ] Confirm the two `vercel.json` cron entries both registered correctly after this deploy (Vercel Hobby allows multiple crons, but each is capped to once/day at minimum interval — the cleanup cron is weekly, which is fine).
- [ ] Stripe security-checklist submission is still under review as of 2026-08-30 (see memory file `zonostick-rebrand-status.md`).

## Explicitly deferred (by user decision, not an oversight)

- Job queue migration (Upstash QStash / Inngest) — current concurrency+time-budget approach in `daily-check` is sufficient at this scale.
- Legal page translation — kept Japanese-only for accuracy.
- Stripe Customer Portal — flagged above as a near-term follow-up, not this session's scope.
