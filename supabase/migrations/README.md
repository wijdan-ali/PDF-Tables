# Database Migrations

This directory contains SQL migration files for setting up the PDF Tables database schema.

## Migration Order

Run migrations in this order:

1. **001_initial_schema.sql** - Creates tables, indexes, and triggers
2. **002_rls_policies.sql** - Enables RLS and creates security policies
3. **003_row_order.sql** - Adds `row_order` for stable row ordering
4. **004_touch_tables_on_row_change.sql** - Touches `user_tables.updated_at` when rows change
5. **005_profiles.sql** - Adds `profiles` to store full name + company name (and trigger)

## Running Migrations

### Via Supabase Dashboard

1. Open your Supabase project
2. Go to **SQL Editor**
3. Copy the contents of each migration file
4. Paste and run in order

### Via Supabase CLI

```bash
supabase db push
```

⚠️ Supabase CLI only applies migrations named like `YYYYMMDDHHMMSS_name.sql`.

This repo includes timestamped migrations for Supabase CLI:

- **20260109143329_baseline.sql** - Baseline schema (matches remote migration history)
- **20260113120000_profiles.sql** - Adds `profiles` (full name + company name) + trigger

If `supabase db push` errors with "Remote migration versions not found", ensure you have a local file with the same version(s) shown in the error output.

## Migration Details

### 001_initial_schema.sql

- Creates `user_tables` table
- Creates `extracted_rows` table
- Creates indexes for performance
- Creates `updated_at` trigger function
- Applies triggers to both tables

### 002_rls_policies.sql

- Enables RLS on both tables
- Creates SELECT, INSERT, UPDATE, DELETE policies
- Ensures users can only access their own data

## Rollback

These migrations don't include rollback scripts. To rollback:

1. Drop policies: `DROP POLICY IF EXISTS ...`
2. Disable RLS: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`
3. Drop tables: `DROP TABLE IF EXISTS ...`

⚠️ **Warning**: Rolling back will delete all data!

