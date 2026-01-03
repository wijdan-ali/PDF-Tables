-- Migration: Initial Schema
-- Description: Creates user_tables and extracted_rows tables with indexes and triggers
-- Run this in Supabase SQL Editor or via Supabase CLI

-- Enable useful extensions (optional but recommended)
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

-- Optional: GIN index for JSONB queries (useful later for filtering/search)
-- Uncomment if you need advanced JSONB filtering:
-- create index if not exists extracted_rows_data_gin_idx on public.extracted_rows using gin (data);

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

