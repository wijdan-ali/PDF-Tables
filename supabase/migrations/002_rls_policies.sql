-- Migration: Row Level Security (RLS) Policies
-- Description: Enables RLS and creates policies for user_tables and extracted_rows
-- Run this AFTER 001_initial_schema.sql

-- Enable RLS
alter table public.user_tables enable row level security;
alter table public.extracted_rows enable row level security;

-- ============================================
-- user_tables policies
-- ============================================

-- SELECT: Users can only see their own tables
drop policy if exists user_tables_select_own on public.user_tables;
create policy user_tables_select_own
on public.user_tables
for select
using (user_id = auth.uid());

-- INSERT: Users can only create tables for themselves
drop policy if exists user_tables_insert_own on public.user_tables;
create policy user_tables_insert_own
on public.user_tables
for insert
with check (user_id = auth.uid());

-- UPDATE: Users can only update their own tables
drop policy if exists user_tables_update_own on public.user_tables;
create policy user_tables_update_own
on public.user_tables
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- DELETE: Users can only delete their own tables
drop policy if exists user_tables_delete_own on public.user_tables;
create policy user_tables_delete_own
on public.user_tables
for delete
using (user_id = auth.uid());

-- ============================================
-- extracted_rows policies (ownership via join to user_tables)
-- ============================================

-- SELECT: Users can only see rows from tables they own
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

-- INSERT: Users can only create rows in tables they own
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

-- UPDATE: Users can only update rows from tables they own
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

-- DELETE: Users can only delete rows from tables they own
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

