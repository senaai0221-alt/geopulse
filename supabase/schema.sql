-- =====================================================================
-- GEOPulse Database Schema
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
  create type llm_provider as enum ('chatgpt', 'claude', 'perplexity', 'gemini');
exception when duplicate_object then null; end $$;

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
  company_name text,
  slack_webhook_url text,
  slack_enabled boolean not null default false,
  plan plan_tier not null default 'free',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- brands: a tracked brand / product owned by a user
-- ---------------------------------------------------------------------
create table if not exists public.brands (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  domain text,
  competitors text[] not null default '{}',
  is_active boolean not null default true,
  -- alert when the rank position worsens (numerically increases) by at
  -- least this many places between two consecutive checks
  rank_drop_threshold int not null default 3,
  created_at timestamptz not null default now()
);

create index if not exists brands_user_idx on public.brands (user_id);

-- ---------------------------------------------------------------------
-- prompts: natural-language queries sent to each LLM on behalf of a brand
-- e.g. "What are the best project management tools for startups?"
-- ---------------------------------------------------------------------
create table if not exists public.prompts (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists prompts_brand_idx on public.prompts (brand_id);

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
  raw_response text,
  error text,
  checked_at timestamptz not null default now()
);

-- Adds the citations column for databases created before this field
-- existed; safe to re-run.
alter table public.rankings add column if not exists citations text[] not null default '{}';

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
  sent_to_slack boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists alerts_user_created_idx on public.alerts (user_id, created_at desc);

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
