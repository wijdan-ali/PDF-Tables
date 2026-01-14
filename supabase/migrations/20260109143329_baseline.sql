-- Baseline migration to match remote migration version: 20260109143329
-- Supabase CLI requires filenames: "<timestamp>_name.sql".
-- This file mirrors the schema previously managed via 001-004 migrations.

create extension if not exists "pgcrypto";

-- 1) user_tables: stores user-defined table schema
create table if not exists public.user_tables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_tables_user_id_idx on public.user_tables (user_id);

-- 2) extracted_rows: stores extracted data per uploaded PDF
create table if not exists public.extracted_rows (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.user_tables (id) on delete cascade,

  -- Storage references (private bucket paths, not public URLs)
  file_path text not null,
  thumbnail_path text,

  -- Extracted data + review state
  data jsonb not null default '{}'::jsonb,
  is_verified boolean not null default false,

  -- Extraction lifecycle + error/debug
  status text not null default 'uploaded',  -- uploaded|extracting|extracted|failed
  error text,
  raw_response text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists extracted_rows_table_id_idx on public.extracted_rows (table_id);
create index if not exists extracted_rows_status_idx on public.extracted_rows (status);
create index if not exists extracted_rows_verified_idx on public.extracted_rows (is_verified);

-- updated_at trigger helper function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply updated_at triggers
drop trigger if exists set_user_tables_updated_at on public.user_tables;
create trigger set_user_tables_updated_at
before update on public.user_tables
for each row
execute function public.set_updated_at();

drop trigger if exists set_extracted_rows_updated_at on public.extracted_rows;
create trigger set_extracted_rows_updated_at
before update on public.extracted_rows
for each row
execute function public.set_updated_at();

-- Add persistent ordering for extracted_rows to support drag-and-drop reordering in the UI.
alter table public.extracted_rows
  add column if not exists row_order double precision;

update public.extracted_rows
  set row_order = extract(epoch from created_at)
  where row_order is null;

alter table public.extracted_rows
  alter column row_order set not null;

create index if not exists extracted_rows_table_order_idx
  on public.extracted_rows (table_id, row_order desc, created_at desc);

-- Enable RLS
alter table public.user_tables enable row level security;
alter table public.extracted_rows enable row level security;

-- user_tables policies
drop policy if exists user_tables_select_own on public.user_tables;
create policy user_tables_select_own
on public.user_tables
for select
using (user_id = auth.uid());

drop policy if exists user_tables_insert_own on public.user_tables;
create policy user_tables_insert_own
on public.user_tables
for insert
with check (user_id = auth.uid());

drop policy if exists user_tables_update_own on public.user_tables;
create policy user_tables_update_own
on public.user_tables
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_tables_delete_own on public.user_tables;
create policy user_tables_delete_own
on public.user_tables
for delete
using (user_id = auth.uid());

-- extracted_rows policies (ownership via join to user_tables)
drop policy if exists extracted_rows_select_own on public.extracted_rows;
create policy extracted_rows_select_own
on public.extracted_rows
for select
using (
  exists (
    select 1
    from public.user_tables t
    where t.id = extracted_rows.table_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists extracted_rows_insert_own on public.extracted_rows;
create policy extracted_rows_insert_own
on public.extracted_rows
for insert
with check (
  exists (
    select 1
    from public.user_tables t
    where t.id = extracted_rows.table_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists extracted_rows_update_own on public.extracted_rows;
create policy extracted_rows_update_own
on public.extracted_rows
for update
using (
  exists (
    select 1
    from public.user_tables t
    where t.id = extracted_rows.table_id
      and t.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.user_tables t
    where t.id = extracted_rows.table_id
      and t.user_id = auth.uid()
  )
);

drop policy if exists extracted_rows_delete_own on public.extracted_rows;
create policy extracted_rows_delete_own
on public.extracted_rows
for delete
using (
  exists (
    select 1
    from public.user_tables t
    where t.id = extracted_rows.table_id
      and t.user_id = auth.uid()
  )
);

-- Keep user_tables.updated_at in sync with extracted_rows activity
create or replace function public.touch_user_table_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'DELETE') then
    update public.user_tables
      set updated_at = now()
      where id = old.table_id;
    return old;
  else
    update public.user_tables
      set updated_at = now()
      where id = new.table_id;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_touch_user_table_updated_at on public.extracted_rows;
create trigger trg_touch_user_table_updated_at
after insert or update or delete on public.extracted_rows
for each row
execute function public.touch_user_table_updated_at();

