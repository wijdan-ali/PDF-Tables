# Storage Bucket Setup

This document describes how to set up the Supabase Storage bucket for PDFs and thumbnails.

## Bucket Configuration

### 1. Create the Bucket

1. Go to your Supabase project dashboard
2. Navigate to **Storage** → **Buckets**
3. Click **New bucket**
4. Configure as follows:
   - **Name**: `documents`
   - **Public bucket**: ❌ **Unchecked** (Private)
   - **File size limit**: Set appropriate limit (e.g., 10MB for PDFs)
   - **Allowed MIME types**: `application/pdf` (for PDFs), `image/png` (for thumbnails)

### 2. Storage Policies (Optional)

For MVP, we use **signed URLs** generated server-side, so Storage policies can remain minimal. However, if you want additional security, you can add policies:

#### Policy: Users can only upload to their own folder

```sql
-- Allow users to upload PDFs to their own user folder
create policy "Users can upload to own folder"
on storage.objects
for insert
with check (
  bucket_id = 'documents' and
  (storage.foldername(name))[1] = 'user' and
  (storage.foldername(name))[2] = auth.uid()::text
);
```

#### Policy: Users can only read from their own folder

```sql
-- Allow users to read files from their own folder
create policy "Users can read from own folder"
on storage.objects
for select
using (
  bucket_id = 'documents' and
  (storage.foldername(name))[1] = 'user' and
  (storage.foldername(name))[2] = auth.uid()::text
);
```

#### Policy: Users can only delete from their own folder

```sql
-- Allow users to delete files from their own folder
create policy "Users can delete from own folder"
on storage.objects
for delete
using (
  bucket_id = 'documents' and
  (storage.foldername(name))[1] = 'user' and
  (storage.foldername(name))[2] = auth.uid()::text
);
```

> **Note**: These policies are optional. The application uses server-side signed URLs, which provides security without requiring complex Storage policies.

## Path Structure

Files are stored with the following structure:

- **PDFs**: `user/{user_id}/table/{table_id}/row/{row_id}.pdf`
- **Thumbnails**: `user/{user_id}/table/{table_id}/row/{row_id}.png`

Example:
```
documents/
  user/
    abc123-user-id/
      table/
        def456-table-id/
          row/
            ghi789-row-id.pdf
            ghi789-row-id.png
```

## Access Pattern

The application generates **signed URLs** server-side for:
- **Upload**: Optional signed upload URLs (or server-side upload)
- **Read**: Signed URLs for PDFs and thumbnails (expire after 1 hour)

This approach:
- ✅ Keeps files private
- ✅ No need for complex Storage policies
- ✅ Server controls access
- ✅ URLs expire automatically

## Testing

After setup, verify:

1. **Bucket exists**: Check Storage → Buckets → `documents`
2. **Upload works**: Try uploading a PDF via the application
3. **Signed URLs work**: Verify PDFs and thumbnails load in the UI

