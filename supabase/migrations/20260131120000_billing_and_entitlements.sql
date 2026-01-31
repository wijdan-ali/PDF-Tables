-- Billing + Entitlements + Usage (Stripe + no-card trial)
-- Adds:
-- - billing_customers, billing_subscriptions
-- - entitlements (single source of truth for gating)
-- - usage_monthly, usage_trial counters
-- - RPC: claim_pro_trial() (no-card 7-day pro trial with 50 doc limit)
-- - Trigger: increment usage counters on extracted_rows status -> 'extracted'

create extension if not exists "pgcrypto";

-- -----------------------------
-- Tables
-- -----------------------------

create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_subscription_id text unique not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  price_id text,
  plan_key text,     -- starter|pro
  interval text,     -- month|year
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id);

-- Entitlements are the only thing the app should gate off of.
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free', -- free|starter|pro|pro_trial
  trial_claimed_at timestamptz,
  trial_expires_at timestamptz,
  docs_limit_monthly integer, -- starter=200
  docs_limit_trial integer,   -- pro_trial=50
  batch_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_monthly (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  docs_extracted integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

create table if not exists public.usage_trial (
  user_id uuid primary key references auth.users (id) on delete cascade,
  trial_started_at timestamptz not null,
  trial_expires_at timestamptz not null,
  docs_extracted integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------
-- updated_at triggers
-- (public.set_updated_at() is defined in 001_initial_schema.sql)
-- -----------------------------

drop trigger if exists set_billing_customers_updated_at on public.billing_customers;
create trigger set_billing_customers_updated_at
before update on public.billing_customers
for each row
execute function public.set_updated_at();

drop trigger if exists set_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger set_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row
execute function public.set_updated_at();

drop trigger if exists set_entitlements_updated_at on public.entitlements;
create trigger set_entitlements_updated_at
before update on public.entitlements
for each row
execute function public.set_updated_at();

drop trigger if exists set_usage_monthly_updated_at on public.usage_monthly;
create trigger set_usage_monthly_updated_at
before update on public.usage_monthly
for each row
execute function public.set_updated_at();

drop trigger if exists set_usage_trial_updated_at on public.usage_trial;
create trigger set_usage_trial_updated_at
before update on public.usage_trial
for each row
execute function public.set_updated_at();

-- -----------------------------
-- RLS
-- -----------------------------

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.usage_monthly enable row level security;
alter table public.usage_trial enable row level security;

-- Read-only policies for end users; writes happen via service role / security definer.

drop policy if exists billing_customers_select_own on public.billing_customers;
create policy billing_customers_select_own
on public.billing_customers
for select
using (user_id = auth.uid());

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own
on public.billing_subscriptions
for select
using (user_id = auth.uid());

drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own
on public.entitlements
for select
using (user_id = auth.uid());

drop policy if exists usage_monthly_select_own on public.usage_monthly;
create policy usage_monthly_select_own
on public.usage_monthly
for select
using (user_id = auth.uid());

drop policy if exists usage_trial_select_own on public.usage_trial;
create policy usage_trial_select_own
on public.usage_trial
for select
using (user_id = auth.uid());

-- -----------------------------
-- Bootstrap entitlement row on signup
-- -----------------------------

create or replace function public.handle_new_user_entitlements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entitlements (user_id, tier, docs_limit_monthly, docs_limit_trial, batch_enabled)
  values (new.id, 'free', null, null, false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_entitlements on auth.users;
create trigger on_auth_user_created_entitlements
after insert on auth.users
for each row
execute function public.handle_new_user_entitlements();

-- Backfill (safe to re-run)
insert into public.entitlements (user_id, tier, docs_limit_monthly, docs_limit_trial, batch_enabled)
select u.id, 'free', null, null, false
from auth.users u
on conflict (user_id) do nothing;

-- -----------------------------
-- Helper functions
-- -----------------------------

-- Returns the effective entitlement state for a given user (used by server-side).
create or replace function public.get_user_entitlement(p_user_id uuid)
returns table (
  tier text,
  trial_expires_at timestamptz,
  docs_limit_monthly integer,
  docs_limit_trial integer,
  batch_enabled boolean
)
language sql
security invoker
set search_path = public
as $$
  select
    e.tier,
    e.trial_expires_at,
    e.docs_limit_monthly,
    e.docs_limit_trial,
    e.batch_enabled
  from public.entitlements e
  where e.user_id = p_user_id;
$$;

-- Decide whether the user can start another extraction right now.
create or replace function public.can_extract_document(p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  e public.entitlements%rowtype;
  month_start date;
  month_used int;
  trial_used int;
begin
  select * into e from public.entitlements where user_id = p_user_id;
  if not found then
    return false;
  end if;

  if e.tier = 'pro' then
    return true;
  end if;

  if e.tier = 'starter' then
    month_start := (date_trunc('month', now())::date);
    select coalesce(um.docs_extracted, 0) into month_used
    from public.usage_monthly um
    where um.user_id = p_user_id and um.period_start = month_start;
    return month_used < coalesce(e.docs_limit_monthly, 0);
  end if;

  if e.tier = 'pro_trial' then
    if e.trial_expires_at is null then
      return false;
    end if;
    if now() >= e.trial_expires_at then
      return false;
    end if;

    select coalesce(ut.docs_extracted, 0) into trial_used
    from public.usage_trial ut
    where ut.user_id = p_user_id;
    return trial_used < coalesce(e.docs_limit_trial, 0);
  end if;

  return false;
end;
$$;

-- Claim a 7-day pro trial without a credit card.
-- Rules:
-- - one trial per user ever (trial_claimed_at)
-- - cannot start if already paid tier (starter/pro)
-- - sets trial docs limit = 50, batch_enabled = true
create or replace function public.claim_pro_trial()
returns table (
  tier text,
  trial_expires_at timestamptz,
  docs_limit_trial integer,
  batch_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  e public.entitlements%rowtype;
  expires_at timestamptz;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Unauthorized';
  end if;

  select * into e from public.entitlements where user_id = uid;
  if not found then
    insert into public.entitlements (user_id) values (uid)
    on conflict (user_id) do nothing;
    select * into e from public.entitlements where user_id = uid;
  end if;

  if e.tier in ('starter', 'pro') then
    raise exception 'Already subscribed';
  end if;

  if e.trial_claimed_at is not null then
    raise exception 'Trial already claimed';
  end if;

  expires_at := now() + interval '7 days';

  update public.entitlements
    set
      tier = 'pro_trial',
      trial_claimed_at = now(),
      trial_expires_at = expires_at,
      docs_limit_monthly = null,
      docs_limit_trial = 50,
      batch_enabled = true
    where user_id = uid;

  insert into public.usage_trial (user_id, trial_started_at, trial_expires_at, docs_extracted)
  values (uid, now(), expires_at, 0)
  on conflict (user_id) do update set
    trial_expires_at = excluded.trial_expires_at;

  return query
  select
    ent.tier,
    ent.trial_expires_at,
    ent.docs_limit_trial,
    ent.batch_enabled
  from public.entitlements ent
  where ent.user_id = uid;
end;
$$;

-- -----------------------------
-- Usage increment trigger
-- -----------------------------

create or replace function public.increment_usage_on_row_extracted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  e public.entitlements%rowtype;
  month_start date;
begin
  -- Only count on transition into 'extracted'
  if (tg_op <> 'UPDATE') then
    return new;
  end if;
  if (old.status is distinct from 'extracted') and (new.status = 'extracted') then
    select t.user_id into owner_id
    from public.user_tables t
    where t.id = new.table_id;

    if owner_id is null then
      return new;
    end if;

    select * into e from public.entitlements where user_id = owner_id;
    if not found then
      return new;
    end if;

    if e.tier = 'starter' then
      month_start := (date_trunc('month', now())::date);
      insert into public.usage_monthly (user_id, period_start, docs_extracted)
      values (owner_id, month_start, 1)
      on conflict (user_id, period_start) do update
        set docs_extracted = public.usage_monthly.docs_extracted + 1;
    elsif e.tier = 'pro_trial' then
      update public.usage_trial
        set docs_extracted = docs_extracted + 1
        where user_id = owner_id;
    else
      -- pro/free: no counters (pro unlimited; free should not be extracting)
      null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_increment_usage_on_row_extracted on public.extracted_rows;
create trigger trg_increment_usage_on_row_extracted
after update of status on public.extracted_rows
for each row
execute function public.increment_usage_on_row_extracted();

