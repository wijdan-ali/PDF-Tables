-- Optimize /api/tables list by returning record counts in one query.

create or replace function public.get_user_tables_with_counts()
returns table (
  id uuid,
  table_name text,
  created_at timestamptz,
  updated_at timestamptz,
  records_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    t.id,
    t.table_name,
    t.created_at,
    t.updated_at,
    count(r.id) as records_count
  from public.user_tables t
  left join public.extracted_rows r
    on r.table_id = t.id
  where t.user_id = auth.uid()
  group by t.id, t.table_name, t.created_at, t.updated_at
  order by t.updated_at desc;
$$;

