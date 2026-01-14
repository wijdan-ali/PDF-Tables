-- Harden SECURITY DEFINER trigger function by setting explicit search_path.
-- This avoids privilege escalation via a poisoned search_path.

create or replace function public.touch_user_table_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
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

