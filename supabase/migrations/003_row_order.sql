-- Add persistent ordering for extracted_rows to support drag-and-drop reordering in the UI.
-- We use a float-like numeric (double precision) to allow "insert between" ordering without rewriting all rows.

alter table public.extracted_rows
  add column if not exists row_order double precision;

-- Backfill existing rows with a stable value that preserves the current ordering (created_at desc).
update public.extracted_rows
  set row_order = extract(epoch from created_at)
  where row_order is null;

alter table public.extracted_rows
  alter column row_order set not null;

create index if not exists extracted_rows_table_order_idx
  on public.extracted_rows (table_id, row_order desc, created_at desc);


