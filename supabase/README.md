# Supabase Database Setup

This directory contains SQL migrations and setup instructions for the PDF Tables application.

## Quick Start

1. **Run migrations in order**:
   - `001_initial_schema.sql` - Creates tables, indexes, and triggers
   - `002_rls_policies.sql` - Sets up Row Level Security

2. **Set up Storage bucket**:
   - Follow instructions in `storage_setup.md`

## Migration Files

### `001_initial_schema.sql`

Creates:
- `user_tables` table (stores table schemas)
- `extracted_rows` table (stores extracted data)
- Indexes for performance
- Triggers for `updated_at` timestamps

### `002_rls_policies.sql`

Enables Row Level Security and creates policies:
- Users can only access their own tables
- Users can only access rows from tables they own

## How to Run Migrations

### Option 1: Supabase Dashboard (Recommended for MVP)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `001_initial_schema.sql`
4. Copy and paste the SQL
5. Click **Run**
6. Repeat for `002_rls_policies.sql`

### Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

Or manually:

```bash
# Run each migration
psql -h your-db-host -U postgres -d postgres -f migrations/001_initial_schema.sql
psql -h your-db-host -U postgres -d postgres -f migrations/002_rls_policies.sql
```

## Verification

After running migrations, verify:

1. **Tables exist**:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('user_tables', 'extracted_rows');
   ```

2. **RLS is enabled**:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN ('user_tables', 'extracted_rows');
   ```

3. **Policies exist**:
   ```sql
   SELECT schemaname, tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'public' 
   AND tablename IN ('user_tables', 'extracted_rows');
   ```

## Schema Overview

### `user_tables`

Stores user-defined table schemas with JSONB columns.

- `id`: UUID primary key
- `user_id`: Foreign key to `auth.users`
- `table_name`: User-friendly table name
- `columns`: JSONB array of column definitions
- `created_at`, `updated_at`: Timestamps

### `extracted_rows`

Stores extracted data from PDFs.

- `id`: UUID primary key
- `table_id`: Foreign key to `user_tables`
- `file_path`: Storage path to PDF
- `thumbnail_path`: Storage path to thumbnail (nullable)
- `data`: JSONB object with extracted values
- `is_verified`: Boolean verification status
- `status`: Extraction status (`uploaded|extracting|extracted|failed`)
- `error`: Error message if extraction failed
- `raw_response`: Raw AI response for debugging
- `created_at`, `updated_at`: Timestamps

## JSONB Structure

### `user_tables.columns`

Array of column objects:
```json
[
  {
    "label": "Total Amount",
    "key": "total_amount",
    "desc": "Final amount including tax",
    "order": 0
  }
]
```

### `extracted_rows.data`

Object with keys matching column keys:
```json
{
  "total_amount": 150.00,
  "vendor": "Acme Corp",
  "invoice_date": "2024-01-01"
}
```

## Troubleshooting

### Migration fails with "relation already exists"

The migrations use `create table if not exists`, so this shouldn't happen. If it does:
- Check if tables already exist
- Drop and recreate if needed (⚠️ **WARNING**: This deletes data)

### RLS policies not working

1. Verify RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'user_tables';`
2. Check policies exist: `SELECT * FROM pg_policies WHERE tablename = 'user_tables';`
3. Verify user is authenticated: Check `auth.uid()` returns a value

### Storage bucket not accessible

1. Verify bucket exists and is named `documents`
2. Check bucket is private (not public)
3. Verify signed URLs are being generated correctly in the API

## Next Steps

After database setup:
1. ✅ Run migrations
2. ✅ Set up Storage bucket (see `storage_setup.md`)
3. ✅ Configure environment variables in `.env.local`
4. ✅ Test the application

