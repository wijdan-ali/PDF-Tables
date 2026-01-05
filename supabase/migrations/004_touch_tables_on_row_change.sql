-- Keep user_tables.updated_at in sync with any activity in extracted_rows
-- so the sidebar can sort tables by "most recently edited" reliably.

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


