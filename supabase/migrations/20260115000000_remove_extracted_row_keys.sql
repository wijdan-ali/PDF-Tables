-- Remove deleted column keys from extracted_rows.data
-- This enforces "deleting a column removes its stored data from the database".

create or replace function public.remove_extracted_row_keys(
  p_table_id uuid,
  p_keys text[]
)
returns integer
language plpgsql
as $$
declare
  affected integer := 0;
begin
  if p_table_id is null then
    raise exception 'p_table_id is required';
  end if;

  if p_keys is null or array_length(p_keys, 1) is null then
    return 0;
  end if;

  -- Remove keys from the JSONB object for all rows in the table.
  update public.extracted_rows
    set data = data - p_keys
    where table_id = p_table_id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Allow logged-in users to execute (RLS still applies to the update).
grant execute on function public.remove_extracted_row_keys(uuid, text[]) to authenticated;

