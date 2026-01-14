# CodeVibes Analysis Report

**Repository:** wijdan-ali/PDF-Tables
**Date:** 2026-01-14
**Score:** 0/100
**Files:** 20
**Tokens:** 82,291

---

## 🔴 Critical (3)

### CORS allows all origins with credentials
The CORS headers set 'Access-Control-Allow-Origin' to '*' (all origins). This is a permissive configuration that could allow any website to make requests to the Supabase Edge Function. While the comment suggests restricting in production, the code currently allows all origins.
**File:** `supabase/functions/_shared/cors.ts:4`
**Suggestion:** Restrict the 'Access-Control-Allow-Origin' header to specific, trusted domains (e.g., your Vercel deployment domain). Use environment variables to configure allowed origins dynamically for different environments.
```
// Secure version with restricted origins
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://your-app.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
```

### Sequential storage deletion causes slow table deletion
Line 70: The function deletes storage objects in a for-loop with 500-item batches, but each batch is processed sequentially with await. For a table with 10,000 files (20 batches), this adds 20 sequential network calls, each taking ~100ms, totaling 2+ seconds just for storage cleanup.
**File:** `supabase/functions/delete-table/index.ts:70`
**Suggestion:** Process all batches in parallel using Promise.all(). Since each batch is independent, this reduces deletion time to the slowest single batch (~100ms).
```
// Replace lines 70-76 with:
const removePromises = []
for (let i = 0; i < paths.length; i += 500) {
  const batch = paths.slice(i, i + 500)
  removePromises.push(
    secretClient.storage.from('documents').remove(batch)
  )
}
const results = await Promise.all(removePromises)
for (const result of results) {
  if (result.error) {
    return json({ error: `Failed to delete files: ${result.error.message}` }, { status: 500 })
  }
}
```

### Sequential signed URL generation causes slow row listing
Line 94: The function uses Promise.all() correctly but each signed URL generation inside the map still makes sequential storage API calls. With 100 rows, this creates 100 sequential await calls to createSignedUrl(), each taking ~50ms, totaling 5+ seconds.
**File:** `supabase/functions/list-rows/index.ts:94`
**Suggestion:** Batch the signed URL generation using the storage API's createSignedUrls() method (if available) or implement proper parallelization. Since the Supabase JS client doesn't have batch signed URL creation, at least ensure all promises are created before awaiting.
```
// Current code is already using Promise.all, but the storage calls are sequential within each iteration.
// Ensure the storage calls are properly parallelized:
const rowsWithUrls = await Promise.all(
  rows.map(async (row) => {
    const filePath = typeof row.file_path === 'string' ? row.file_path.trim() : ''
    const thumbnailPath = typeof row.thumbnail_path === 'string' ? row.thumbnail_path.trim() : ''

    // Create both promises immediately before awaiting
    const pdfUrlPromise = filePath
      ? secretClient.storage
          .from('documents')
          .createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN_SECONDS)
          .then(({ data }) => data?.signedUrl)
      : Promise.resolve(undefined)

    const thumbnailUrlPromise = thumbnailPath
      ? secretClient.storage
          .from('documents')
          .createSignedUrl(thumbnailPath, SIGNED_URL_EXPIRES_IN_SECONDS)
          .then(({ data }) => data?.signedUrl)
      : Promise.resolve(undefined)

    // Await both in parallel
    const [pdf_url, thumbnail_url] = await Promise.all([pdfUrlPromise, thumbnailUrlPromise])

    return {
      ...row,
      pdf_url,
      thumbnail_url,
      data: row.data as Record<string, string | number | null>,
    }
  })
)
```

## 🟡 Important (14)

### Trigger function uses security definer without explicit search_path
The function 'public.touch_user_table_updated_at' is defined with 'security definer' but does not set an explicit 'search_path'. This could allow privilege escalation if an attacker can create objects in the search path.
**File:** `supabase/migrations/004_touch_tables_on_row_change.sql`
**Suggestion:** Set an explicit 'search_path' within the function body to restrict it to trusted schemas, typically just 'public'.

### Trigger function uses security definer without explicit search_path
The function 'public.handle_new_user_profile' is defined with 'security definer' but does not set an explicit 'search_path'. This could allow privilege escalation.
**File:** `supabase/migrations/20260113120000_profiles.sql`
**Suggestion:** Set an explicit 'search_path' within the function definition. The function already includes 'set search_path = public' in its body, but it should be declared in the function header for clarity and safety.

### Trigger function uses security definer without explicit search_path
The function 'public.handle_new_user_settings' is defined with 'security definer' but does not set an explicit 'search_path'.
**File:** `supabase/migrations/20260114120000_user_settings.sql`
**Suggestion:** Declare an explicit 'search_path' in the function header.

### Missing validation for duplicate column keys in PATCH
Line 73: The PATCH handler validates that generated column keys are unique within the new columns array, but doesn't check for conflicts with existing columns in the database. If a user updates columns with keys that duplicate existing keys from other columns, it could cause data corruption.
**File:** `app/api/tables/[tableId]/route.ts`
**Suggestion:** Fetch existing columns from the database and validate that new keys don't conflict with existing ones (excluding the column being updated if it's a rename).

### Missing file size validation for PDF uploads
Line 38: The upload endpoint checks file type but not file size. Large PDF uploads (e.g., 500MB) can exhaust server memory, cause timeouts, and fill up storage quotas quickly.
**File:** `app/api/tables/[tableId]/upload/route.ts`
**Suggestion:** Add file size validation before processing. Reject files over a reasonable limit (e.g., 50MB for PDF extraction).

### Missing transaction for row status updates
Line 202: The function updates row status to 'extracting' before starting extraction, but if the extraction fails later, the error update might not happen (if the function crashes). This leaves rows stuck in 'extracting' state with no way to retry.
**File:** `supabase/functions/extract-table/index.ts`
**Suggestion:** Wrap the entire extraction process in a transaction or implement idempotent retry logic. At minimum, set a timeout and have a cleanup job, or use a more robust state machine.

### Inconsistent modal backdrop click handling
AddColumnModal uses `onClick={onClose}` on the backdrop div (line 40), while EditColumnModal (line 40) and RenameTableModal (line 88) use `onMouseDown={onClose}`. This creates inconsistent user experience and potential bugs where some modals close on mouse down vs click.
**File:** `app/components/AddColumnModal.tsx`
**Suggestion:** Standardize all modal backdrop handlers to use `onMouseDown` for consistent behavior. Update AddColumnModal to match the pattern used in EditColumnModal and RenameTableModal.

### Inconsistent modal backdrop click handling
ConfirmDialog uses `onMouseDown={onCancel}` on the backdrop div (line 27), while AddColumnModal uses `onClick={onClose}`. This creates inconsistent behavior across the application's modal/dialog components.
**File:** `app/components/ConfirmDialog.tsx`
**Suggestion:** Standardize all modal/dialog backdrop handlers to use `onMouseDown` for immediate response. Update all modal components to follow the same pattern.

### Duplicated modal structure and styling
AddColumnModal, EditColumnModal, RenameTableModal, and ConfirmDialog all implement nearly identical modal structure with backdrop, Card wrapper, form handling, and similar styling. This duplication makes maintenance difficult and increases bug risk.
**File:** `app/components/AddColumnModal.tsx`
**Suggestion:** Create a reusable Modal component that handles backdrop, positioning, Card structure, and common interactions. Each specific modal can extend this base component.

### Inconsistent event constant definitions
Sidebar defines event constants (TABLE_NAME_UPDATED_EVENT, TABLE_TOUCHED_EVENT, etc.) inline, while EditableTableName defines the same constants. This duplication can lead to typos and maintenance issues if constants need to change.
**File:** `app/components/Sidebar.tsx`
**Suggestion:** Extract all event constants to a shared file (e.g., `lib/constants/events.ts`) and import them consistently across all components.

### Inconsistent storage key naming
Sidebar defines SIDEBAR_TABLES_CACHE_KEY and AI_PROVIDER_STORAGE_KEY, while TopBar defines USER_INITIAL_CACHE_KEY, and ExtractedRowsGrid defines ORDER_STORAGE_KEY. Each component defines its own storage keys without a consistent naming convention.
**File:** `app/components/Sidebar.tsx`
**Suggestion:** Create a shared constants file for storage keys with consistent naming patterns and import them across components.

### Extremely complex component with multiple responsibilities
ExtractedRowsGrid.tsx is 1400+ lines and handles: data fetching, column management, row editing, drag-and-drop for rows and columns, selection mode, resizing, caching, and multiple modal states. This violates Single Responsibility Principle and makes the component difficult to maintain, test, and debug.
**File:** `app/tables/[tableId]/components/ExtractedRowsGrid.tsx`
**Suggestion:** Split into smaller, focused components: 1) DataTable (main grid), 2) ColumnManager (header/editing), 3) RowManager (selection/drag), 4) CellEditor (inline editing), 5) DragDropManager. Use custom hooks to separate business logic from UI.

### Duplicated grain effect implementation
Sidebar implements complex grain effects with constants (SIDEBAR_GRAIN_OPACITY, SIDEBAR_GRAIN_SCALE_PX, etc.), and RecordsCard implements similar but different grain effects. UploadPanel likely has similar code. This visual effect logic is duplicated across multiple components.
**File:** `app/components/Sidebar.tsx`
**Suggestion:** Create a reusable GrainOverlay component that accepts props for opacity, scale, contrast, and brightness. Use this component consistently across Sidebar, RecordsCard, UploadPanel, and any other components needing grain effects.

### Inconsistent user data fetching patterns
TopBar fetches user data with supabase.auth.getUser() and profiles table lookup, while Sidebar does similar but with different caching strategies. SettingsClient also handles profile updates. There's no shared hook or service for user data management.
**File:** `app/components/TopBar.tsx`
**Suggestion:** Create a useUserData hook or userService that centralizes user data fetching, caching, and updates. This ensures consistent data handling across the application.

## 🟢 Nice-to-have (6)

### Inefficient count aggregation for table records
Line 73: The GET handler uses Supabase's embedded count() which executes a COUNT(*) query for each table. With 100 tables, this creates 100+ COUNT queries instead of a single aggregated query.
**Suggestion:** Use a single query with LEFT JOIN and COUNT aggregation, or fetch counts in a separate batch query. Since Supabase doesn't support COUNT in joins easily, fetch counts separately and map them.





### Complex PDF rendering logic with manual caching
PdfThumbnailCell implements manual caching with previewCache Map, URL parsing, expiration checking, and PDF.js integration. This logic is complex and could be abstracted into a separate service or hook.
**Suggestion:** Extract PDF thumbnail generation logic into a usePdfThumbnail hook or PdfThumbnailService. Separate concerns: URL management, caching, PDF rendering, and error handling.







