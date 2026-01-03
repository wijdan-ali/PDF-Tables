# Database Migrations

This directory contains SQL migration files for setting up the PDF Tables database schema.

## Migration Order

Run migrations in this order:

1. **001_initial_schema.sql** - Creates tables, indexes, and triggers
2. **002_rls_policies.sql** - Enables RLS and creates security policies

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

This will run all migrations in order.

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

