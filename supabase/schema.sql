-- =====================================================================
-- Zonostick Database Schema
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
-- or via: supabase db execute -f supabase/schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type llm_provider as enum ('chatgpt', 'claude', 'perplexity', 'gemini', 'grok', 'deepseek');
exception when duplicate_object then null; end $$;

-- Adds grok/deepseek for databases created before these providers
-- existed; safe to re-run.
alter type llm_provider add value if not exists 'grok';
alter type llm_provider add value if not exists 'deepseek';

do $$ begin
  create type plan_tier as enum ('free', 'pro', 'business');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles: 1:1 extension of auth.users
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  -- White-label report branding (Business plan - app/dashboard/settings/
  -- white-label-form.tsx): company_name already existed unused; adding
  -- only the logo URL. Both null means the printed/PDF report falls
  -- back to standard Zonostick branding.
  company_name text,
  report_logo_url text,
  slack_webhook_url text,
  slack_enabled boolean not null default false,
  -- Email alerts (app/dashboard/settings/email-alerts-form.tsx) are the
  -- default/primary notification channel - on for every profile,
  -- existing and new, unless explicitly turned off. Slack (above) is now
  -- positioned as an optional, additional channel.
  email_alerts_enabled boolean not null default true,
  -- Where alert emails actually go, if the user has pointed them
  -- somewhere other than their own sign-in address (e.g. a shared team
  -- inbox) - null means "use `email` above", never overwritten by it.
  -- Deliberately unverified (no confirmation-link flow): the tradeoff
  -- this app has made everywhere else too (Slack webhook URLs are the
  -- same - paste and go) in favor of zero setup friction.
  notification_email text,
  plan plan_tier not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adds report_logo_url / email_alerts_enabled / notification_email for
-- databases created before these fields existed; safe to re-run.
alter table public.profiles add column if not exists report_logo_url text;
alter table public.profiles add column if not exists email_alerts_enabled boolean not null default true;
alter table public.profiles add column if not exists notification_email text;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;

-- ---------------------------------------------------------------------
-- brands: a tracked brand / product owned by a user
-- ---------------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  domain text,
  -- Alternate names/nicknames for this exact brand - e.g. name=
  -- "プーメリー" (a common nickname), aliases=["くまのプーさん えらべる
  -- 回転6WAY ジムにへんしんメリー"] (the official product name). Added
  -- after a real false "圏外" alert: an LLM response described the
  -- product at #1 by its full official name only, with no mention of
  -- the nickname anywhere in the text, so the exact-string mention
  -- matcher (lib/geo-engine.ts parseResponse - deliberately never
  -- LLM-judged, see that file's own comments) correctly reported "not
  -- found" for a literal string that genuinely wasn't there, even
  -- though the same product plainly was. Aliases widen the set of
  -- exact strings that count as "this is the brand", same mechanism as
  -- `competitors` below, applied to the tracked brand itself - still
  -- zero LLM judgment involved, just more than one string to check.
  aliases text[] not null default '{}',
  competitors text[] not null default '{}',
  is_active boolean not null default true,
  -- alert when the rank position worsens (numerically increases) by at
  -- least this many places between two consecutive checks
  rank_drop_threshold int not null default 3,
  created_at timestamptz not null default now()
);

-- Adds aliases for databases created before this field existed; safe to
-- re-run.
alter table public.brands add column if not exists aliases text[] not null default '{}';

create index if not exists brands_user_idx on public.brands (user_id);

-- Has this account been through the one-page setup wizard yet (see
-- app/onboarding/page.tsx)? middleware.ts sends any paid account with
-- profiles.onboarding_completed still false to /onboarding instead of
-- /dashboard. That column defaults to false (see its own ADD COLUMN
-- above) so a brand-new signup always sees the wizard once, right
-- after subscribing - but the same default would incorrectly re-send
-- every EXISTING paid account through it too the moment the column
-- first appears, since none of them have ever had a chance to set it.
-- This backfill (placed here, after `brands` exists, rather than next
-- to the column's own ADD COLUMN above) marks anyone who already has
-- at least one brand - i.e. has plainly already been through some form
-- of setup, wizard or not - as complete, so this rollout only ever
-- affects genuinely new signups going forward. Safe to re-run.
update public.profiles p
set onboarding_completed = true
where onboarding_completed = false
  and exists (select 1 from public.brands b where b.user_id = p.id);

-- ---------------------------------------------------------------------
-- prompts: natural-language queries sent to each LLM on behalf of a brand
-- e.g. "What are the best project management tools for startups?"
-- ---------------------------------------------------------------------
create table if not exists public.prompts (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  text text not null,
  -- Optional free-text group label (a lightweight "cohort"), e.g.
  -- "Core", "競合比較", "機能訴求" - used to group results on the dashboard.
  category text,
  is_active boolean not null default true,
  -- When the on-demand check (app/api/prompts/check-now) last ran for
  -- this prompt - used to rate-limit that endpoint so a user can't spam
  -- real LLM API spend via repeated manual/first-time checks.
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists prompts_brand_idx on public.prompts (brand_id);

-- Adds the category column for databases created before this field
-- existed; safe to re-run.
alter table public.prompts add column if not exists category text;
alter table public.prompts add column if not exists last_checked_at timestamptz;

-- ---------------------------------------------------------------------
-- rankings: one row per (prompt, provider, check run)
-- This is the raw daily measurement written by the cron job.
-- ---------------------------------------------------------------------
create table if not exists public.rankings (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  prompt_id uuid not null references public.prompts (id) on delete cascade,
  provider llm_provider not null,
  mentioned boolean not null default false,
  -- 1-based position within a ranked/numbered list in the LLM response,
  -- or null if the brand was not mentioned / no ranked list was returned
  rank_position int,
  competitors_mentioned text[] not null default '{}',
  -- Source URLs the provider cited (currently only Perplexity returns
  -- these without enabling a separate web-search/grounding tool).
  citations text[] not null default '{}',
  -- Tone of the brand's treatment in the response, judged by a
  -- lightweight LLM call; null if the brand wasn't mentioned or the
  -- judge call was unavailable.
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  raw_response text,
  error text,
  checked_at timestamptz not null default now()
);

-- Adds the citations/sentiment columns for databases created before
-- these fields existed; safe to re-run.
alter table public.rankings add column if not exists citations text[] not null default '{}';
alter table public.rankings add column if not exists sentiment text;
do $$ begin
  alter table public.rankings add constraint rankings_sentiment_check
    check (sentiment in ('positive', 'neutral', 'negative'));
exception when duplicate_object then null; end $$;

create index if not exists rankings_brand_checked_idx on public.rankings (brand_id, checked_at desc);
create index if not exists rankings_prompt_provider_checked_idx on public.rankings (prompt_id, provider, checked_at desc);

-- ---------------------------------------------------------------------
-- alerts: anomalies detected by the daily batch job (rank drops,
-- brand disappearing from a response, etc.), mirrored to Slack.
-- ---------------------------------------------------------------------
create table if not exists public.alerts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  prompt_id uuid references public.prompts (id) on delete set null,
  provider llm_provider,
  severity alert_severity not null default 'info',
  message text not null,
  previous_rank int,
  current_rank int,
  -- The exact rankings row that triggered this alert (2026-09 "メール・
  -- ダッシュボード不一致" fix): lets every reader (dashboard, alert
  -- email, or a debugging script) resolve the alert's rank/time data
  -- from one authoritative record instead of re-querying "the latest
  -- row for this prompt/provider", which can drift out from under a
  -- past alert as later checks come in. Nullable/on delete set null so
  -- pruning old rankings rows never breaks the alert history itself.
  ranking_id uuid references public.rankings (id) on delete set null,
  sent_to_slack boolean not null default false,
  created_at timestamptz not null default now()
);

-- Adds ranking_id for databases created before this column existed;
-- safe to re-run.
alter table public.alerts add column if not exists ranking_id uuid references public.rankings (id) on delete set null;

create index if not exists alerts_user_created_idx on public.alerts (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- feedback: bug reports / feature requests submitted from the Help page
-- (app/dashboard/help/feedback-form.tsx). Durable record of every
-- submission independent of whether the admin Slack notification (see
-- lib/slack.ts buildFeedbackBlocks / FEEDBACK_SLACK_WEBHOOK_URL) is
-- configured or succeeds - Slack is a best-effort notification, this
-- table is the source of truth.
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles (id) on delete set null,
  email text not null,
  type text not null check (type in ('bug', 'feature', 'other')),
  message text not null,
  page_url text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

-- feedback: any authenticated user can insert their own row; no
-- select/update/delete policy is granted, so submissions are readable
-- only via the Supabase dashboard / service role (the operator), never
-- back to the submitting user or anyone else through the app.
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- report_notes: the free-text "agency commentary" and "next actions"
-- boxes on the monthly A4 report (app/dashboard/report/report-notes.tsx),
-- one row per (brand, month) so they persist and print with the report
-- instead of resetting every time it's regenerated.
-- ---------------------------------------------------------------------
create table if not exists public.report_notes (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  -- 'YYYY-MM' - the report month this note belongs to.
  month text not null,
  commentary text,
  next_actions text,
  updated_at timestamptz not null default now(),
  unique (brand_id, month)
);

create index if not exists report_notes_brand_month_idx on public.report_notes (brand_id, month);

alter table public.report_notes enable row level security;

-- report_notes: full CRUD restricted via the parent brand's owner, same
-- pattern as prompts_crud_own.
drop policy if exists "report_notes_crud_own" on public.report_notes;
create policy "report_notes_crud_own" on public.report_notes
  for all using (
    exists (select 1 from public.brands b where b.id = report_notes.brand_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = report_notes.brand_id and b.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- marketing_actions: a user-logged record of an offline/external GEO
-- action ("published a press release on PR TIMES", "added FAQ JSON-LD
-- to the product page") - see app/dashboard/marketing-action-dialog.tsx.
-- Purely a timeline of *what the user did*; it never affects
-- measurement itself. Plotted as event markers on the dashboard's trend
-- charts (components/*-trend-chart.tsx) and, for the report's AI
-- commentary (lib/report-insights.ts), used to compute a before/after
-- exposure-rate split around each action's date so the AI has real
-- numbers to point at instead of guessing at a causal story.
-- ---------------------------------------------------------------------
create table if not exists public.marketing_actions (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  action_date date not null,
  category text not null check (
    category in ('press_release', 'blog_note', 'sns', 'website_seo', 'faq_jsonld', 'other')
  ),
  title text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists marketing_actions_brand_date_idx on public.marketing_actions (brand_id, action_date);

alter table public.marketing_actions enable row level security;

-- marketing_actions: full CRUD restricted via the parent brand's owner,
-- same pattern as report_notes_crud_own/prompts_crud_own.
drop policy if exists "marketing_actions_crud_own" on public.marketing_actions;
create policy "marketing_actions_crud_own" on public.marketing_actions
  for all using (
    exists (select 1 from public.brands b where b.id = marketing_actions.brand_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = marketing_actions.brand_id and b.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- cron_runs: one row per invocation of a scheduled job (currently just
-- /api/cron/daily-check), written by the job itself so its outcome -
-- did it finish, how long did it take, did every brand's Slack/email
-- notification actually go out - is queryable straight from Supabase
-- instead of depending on the hosting platform's own log retention
-- (which on a Hobby-tier Vercel plan only keeps the last ~30 minutes,
-- long gone by the time anyone notices a report never arrived).
--
-- A row is inserted the moment the job *starts*, then updated once it
-- finishes (successfully or via the route's own crash handler). A row
-- that stays with finished_at/ok still null is itself the signal: the
-- process was hard-killed (e.g. the platform's execution time limit)
-- before it ever got a chance to run its own completion/error path.
-- ---------------------------------------------------------------------
create table if not exists public.cron_runs (
  id uuid primary key default uuid_generate_v4(),
  job_name text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  ok boolean,
  error text,
  -- Per-brand outcome (rankings written, anomaly count, and whether
  -- each notification channel actually sent) - shaped like the
  -- existing `summary`/`skipped` arrays the route already builds, see
  -- app/api/cron/daily-check/route.ts.
  summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cron_runs_job_started_idx on public.cron_runs (job_name, started_at desc);

alter table public.cron_runs enable row level security;

-- No policies: this is operational data, not user data - readable only
-- via the Supabase dashboard / service role (the operator), same as
-- feedback. The cron route itself writes with the service-role admin
-- client, which bypasses RLS entirely.

-- ---------------------------------------------------------------------
-- trial_card_fingerprints: one row per physical card that has ever
-- completed a free trial (see lib/stripe.ts's TRIAL_PERIOD_DAYS and
-- app/api/webhooks/stripe/route.ts). isTrialEligible() only checks
-- whether *this account* has ever had a Stripe customer - on its own
-- that only blocks re-using the same account, not signing up again
-- with a fresh email and the exact same card. Stripe's card fingerprint
-- is stable for one physical card across every customer/account it's
-- ever attached to, so this table is the record of "has this card
-- already gotten its one trial" independent of which account used it.
-- ---------------------------------------------------------------------
create table if not exists public.trial_card_fingerprints (
  fingerprint text primary key,
  first_used_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.trial_card_fingerprints enable row level security;

-- No policies: written and read only by the Stripe webhook's
-- service-role admin client, same as cron_runs/feedback above - never
-- exposed to any user's own session.

-- ---------------------------------------------------------------------
-- processed_stripe_events: idempotency ledger for the Stripe webhook
-- (app/api/webhooks/stripe/route.ts). Stripe redelivers an event any
-- time the endpoint doesn't answer 200 in time, and can send the exact
-- same event twice anyway as part of its normal at-least-once delivery
-- guarantee. Re-running the handler on a replay is a hard failure for
-- enforceOneTrialPerCard's insert into trial_card_fingerprints
-- (fingerprint is a primary key, so a second insert of the same card
-- errors) and, more generally, just duplicate work everywhere else -
-- this table is checked at the very top of the handler so a replayed
-- event.id short-circuits to 200 before any of that runs again.
-- ---------------------------------------------------------------------
create table if not exists public.processed_stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;

-- No policies: written and read only by the Stripe webhook's
-- service-role admin client, same as cron_runs/trial_card_fingerprints
-- above - never exposed to any user's own session.

-- ---------------------------------------------------------------------
-- updated_at trigger for profiles
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth.users row is created
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.prompts enable row level security;
alter table public.rankings enable row level security;
alter table public.alerts enable row level security;

-- profiles: a user can read/update only their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- brands: full CRUD restricted to the owning user
drop policy if exists "brands_crud_own" on public.brands;
create policy "brands_crud_own" on public.brands
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- prompts: full CRUD restricted via the parent brand's owner
drop policy if exists "prompts_crud_own" on public.prompts;
create policy "prompts_crud_own" on public.prompts
  for all using (
    exists (select 1 from public.brands b where b.id = prompts.brand_id and b.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = prompts.brand_id and b.user_id = auth.uid())
  );

-- rankings: read-only for end users; rows are written by the cron job
-- using the Supabase service role key, which bypasses RLS entirely.
drop policy if exists "rankings_select_own" on public.rankings;
create policy "rankings_select_own" on public.rankings
  for select using (
    exists (select 1 from public.brands b where b.id = rankings.brand_id and b.user_id = auth.uid())
  );

-- alerts: read-only for end users
drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own" on public.alerts
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Storage: white-label report logo uploads (Business plan -
-- app/dashboard/settings/white-label-form.tsx). One public bucket;
-- each user's file lives under their own uid-prefixed path
-- (report-logos/<user_id>/logo.<ext>, uploaded with upsert so there's
-- only ever one live object per user) so RLS can scope writes per user
-- while reads stay public - the printed/PDF report (and eventually a
-- server-side PDF renderer) needs a plain public URL an <img> tag can
-- load with no auth at all.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('report-logos', 'report-logos', true)
on conflict (id) do nothing;

drop policy if exists "report_logos_insert_own" on storage.objects;
create policy "report_logos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'report-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "report_logos_update_own" on storage.objects;
create policy "report_logos_update_own" on storage.objects
  for update using (
    bucket_id = 'report-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "report_logos_delete_own" on storage.objects;
create policy "report_logos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'report-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- The bucket's own `public = true` flag already serves objects to
-- anyone via their public URL regardless of RLS - this select policy
-- is what lets an authenticated client (not just the public URL path)
-- read/list via the normal Storage API, e.g. to confirm an overwrite
-- succeeded before swapping the preview.
drop policy if exists "report_logos_select_public" on storage.objects;
create policy "report_logos_select_public" on storage.objects
  for select using (bucket_id = 'report-logos');
