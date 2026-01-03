# Frontend Plan (Next.js App Router)

This plan defines the UI/UX and frontend implementation approach for the MVP described in [`plan/PRD.md`](plan/PRD.md), using Next.js **App Router**. It aligns with the architecture defined in [`plan/app-architecture.md`](plan/app-architecture.md).

## Goals

- Users can create and manage **Tables** with a custom **schema** (columns).
- Users can upload a **PDF** into a table context and trigger **AI extraction**.
- Results appear as **rows** in a grid, with a review flow:
  - **Unverified** rows highlighted
  - Users can edit extracted values
  - Users can mark rows **Verified**
- Each row has a **PDF thumbnail** cell at the end.

## Architecture Alignment

This frontend plan implements the **Client (Browser / Next.js UI)** layer described in the architecture:
- Uses **Next.js Route Handlers** (`/api/**`) as the backend surface
- Authenticates via **Supabase Auth** (JWT sessions)
- Relies on **RLS** for data access (user can only see their own tables/rows)
- Uses **signed URLs** for private Storage access (PDFs + thumbnails)
- Assumes **server-generated thumbnails** stored in Storage (default approach)

## File Structure (App Router)

```
app/
  layout.tsx                    # Root layout (auth provider, global styles)
  page.tsx                      # Redirect to /tables
  tables/
    page.tsx                    # Tables list (Server Component)
    new/
      page.tsx                  # Create table form (Client Component)
    [tableId]/
      page.tsx                  # Table detail (Server Component wrapper)
      components/
        SchemaEditor.tsx        # Client Component
        UploadPanel.tsx         # Client Component
        ExtractedRowsGrid.tsx   # Client Component
        PdfThumbnailCell.tsx   # Client Component
  api/                          # Route Handlers (see backend plan)
    tables/
      route.ts
      [tableId]/
        route.ts
        upload/
          route.ts
        extract/
          route.ts
        rows/
          route.ts
    rows/
      [rowId]/
        route.ts
lib/
  supabase/
    client.ts                   # Browser Supabase client
    server.ts                   # Server Supabase client (for Route Handlers)
  utils/
    slugify.ts                  # Variable key generator (must match backend)
types/
  database.ts                   # Generated from Supabase
  api.ts                        # API request/response types
```

## Authentication Setup

### Supabase Client Configuration

**Browser client** (`lib/supabase/client.ts`):
- Uses `@supabase/supabase-js` with `createBrowserClient`
- Stores session in cookies/localStorage (Supabase default)
- Used in Client Components for auth state

**Server client** (`lib/supabase/server.ts`):
- Uses `createServerClient` with cookie-based session
- Used in Route Handlers to validate user session
- Enforces RLS by using user's session context

### Auth Flow

1. User signs in via Supabase Auth (email/password or OAuth)
2. Session JWT stored in cookies
3. Route Handlers validate session before processing requests
4. Client Components can check auth state via `useUser()` hook (custom or Supabase hook)

## Information Architecture (Routes)

Recommended route structure (App Router):

- `/` → redirect to `/tables` (or landing if marketing later)
- `/tables`
  - list all user tables
  - create new table CTA
- `/tables/new`
  - create table form (name + initial columns)
- `/tables/[tableId]`
  - table detail view:
    - schema editor (columns)
    - upload panel
    - extracted rows grid

Optional (can be added later):
- `/tables/[tableId]/rows/[rowId]` → dedicated row inspection page (better for long docs / many fields)

## Page Specs

### 1) Tables List (`/tables`)

**Primary actions**
- Create table
- Open existing table

**Data**
- `GET /api/tables` → list tables (id, name, created_at, column_count)

**UI elements**
- Table cards or list rows with:
  - name
  - last updated
  - number of rows (optional; can be added later)

### 2) Create Table (`/tables/new`)

**Form fields**
- Table name
- Columns editor (repeatable):
  - Column label (required)
  - Column description (required)
  - Auto-generated variable key (read-only preview)

**Client behaviors**
- Generate `key` using a slugify rule (must match backend behavior).
- Enforce uniqueness among keys within the same table.
- Validate minimum 1 column.

**Submit**
- `POST /api/tables`

### 3) Table Detail (`/tables/[tableId]`)

Split into 3 sections:
- Schema editor (top)
- Upload + extraction controls (side or above grid)
- Extracted rows grid (main)

**Data**
- `GET /api/tables/[tableId]` (table metadata + schema)
- `GET /api/tables/[tableId]/rows` (rows)

## Component Plan

### `SchemaEditor`

**Responsibilities**
- Render columns in order
- Add column
- Edit column label/desc
- Delete column
- Reorder columns

**Rules**
- `key` is generated from label on initial create; after that:
  - default: allow editing label/desc only (key stays stable)
  - advanced: support key change with warning (“existing rows won’t automatically migrate”)

**UX**
- Inline edits (label/desc)
- Drag-and-drop reorder (optional) or up/down controls (MVP)

**API**
- `PATCH /api/tables/[tableId]` with new `columns` array

### `UploadPanel`

**Responsibilities**
- Select a PDF file
- Upload to server/storage
- Trigger extraction
- Show progress + errors

**State machine**
- `idle` → `uploading` → `uploaded` → `extracting` → `done` OR `failed`

**Upload Flow (aligned with architecture)**
1. User selects PDF file
2. Client calls `POST /api/tables/[tableId]/upload` (metadata only)
3. Server creates row in DB with `status='uploaded'` and returns `{ row_id, upload_url }`
4. If `upload_url` provided: client uploads file directly to Supabase Storage using signed URL
5. Client calls `POST /api/tables/[tableId]/extract { row_id }` to trigger extraction
6. Server updates row `status='extracting'` → calls ChatPDF → updates `status='extracted'` or `'failed'`
7. Client polls or uses WebSocket/SSE to get extraction result (MVP: polling or refetch after delay)

**Alternative: Server-side upload**
- If server handles upload: client sends file in multipart/form-data to `/upload` endpoint
- Server uploads to Storage, creates row, returns `row_id`
- Client then calls `/extract` endpoint

**API**
- `POST /api/tables/[tableId]/upload`
  - returns: `{ row_id, upload_url? }` (if signed upload URL approach)
  - OR: accepts file in body, uploads server-side, returns `{ row_id }`
- `POST /api/tables/[tableId]/extract`
  - body: `{ row_id }`
  - returns: `{ status: 'extracting'|'extracted'|'failed', data?, error? }`

**UI details**
- Show extraction spinner and status text ("Extracting data...")
- Display progress: "Uploading..." → "Extracting..." → "Done" or "Failed"
- On failure: show error summary + "Retry extraction" button + "Edit manually" button
- Optimistic update: add row to grid immediately with `status='extracting'` (yellow highlight)

### `ExtractedRowsGrid`

**Responsibilities**
- Render each row as a row in a table/grid
- Render each column cell based on schema order
- Render verification state
- Render status indicators (per architecture: `uploaded|extracting|extracted|failed`)
- Render a PDF thumbnail cell at the end

**Rendering rules**
- For each row:
  - Display columns from `user_tables.columns` in `order` sequence.
  - Cell value is `row.data[column.key]` (string/number/date/null).
  - Missing key → display empty (`—`) but keep editable.
  - Show status badge/pill: `uploaded` (gray), `extracting` (blue, spinner), `extracted` (green), `failed` (red)

**Status-based rendering** (aligned with architecture)
- `status='uploaded'`: Row exists but extraction not started (gray badge)
- `status='extracting'`: Extraction in progress (blue badge + spinner, row disabled for editing)
- `status='extracted'`: Successfully extracted (can edit/verify)
- `status='failed'`: Extraction failed (red badge, show error message, allow manual entry)

**Verification styling**
- `is_verified=false` AND `status='extracted'`:
  - row background: light yellow (or badge "Unverified")
- `is_verified=true`:
  - row background: light green (or badge "Verified")
- `status='failed'`:
  - row background: light red (or red border)

**Editing**
- MVP: inline input fields per cell on focus (or "Edit row" mode).
- Only editable when `status='extracted'` or `status='failed'`
- On blur or Save:
  - `PATCH /api/rows/[rowId]` with `{ data: { ...updatedValues } }`
  - Optimistic update: update local state immediately
- Verify button:
  - `PATCH /api/rows/[rowId]` with `{ is_verified: true }`
  - Only enabled when `status='extracted'`
- Retry extraction (for failed rows):
  - `POST /api/tables/[tableId]/extract { row_id }` (same endpoint as initial extraction)

### `PdfThumbnailCell`

**Requirement**
- "At the very end, there must be a column where PDF thumbnail is displayed." (from PRD)

**Default approach (server-generated thumbnail)**
- Backend generates thumbnail during extraction and stores in Storage at path: `user/{user_id}/table/{table_id}/row/{row_id}.png`
- Backend stores `thumbnail_path` in `extracted_rows` table
- Frontend receives signed URLs from API:
  - `/api/tables/[tableId]/rows` returns `thumbnail_url` (signed, expires in 1 hour) and `pdf_url` (signed)
  - OR: frontend calls `/api/rows/[rowId]/signed-assets` to get fresh signed URLs

**Signed URL handling**
- Signed URLs expire (default: 1 hour)
- Frontend should refresh signed URLs when they expire (check expiry or refresh on image error)
- Store signed URLs in component state, refresh on mount or when expired

**UI**
- Render thumbnail image (e.g., 64×64 or 96×96, rounded corners)
- Click opens PDF in new tab (using signed `pdf_url`) or opens a preview modal
- Hover: show tooltip with filename
- Loading state: show placeholder skeleton while thumbnail loads

**Fallback**
- If `thumbnail_path` is null or thumbnail fails to load:
  - show PDF icon + filename; still link to PDF
  - Alternative: show first page preview using PDF.js (client-side render) - more complex but no server dependency

**Alternative: Client-rendered thumbnail (PDF.js)**
- If server thumbnail generation is deferred:
  - Use `react-pdf` or `pdfjs-dist` to render first page client-side
  - Requires signed PDF URL and CORS setup
  - Heavier bundle, slower for large PDFs
  - Architecture doc recommends server-generated as default

## State Management & Data Fetching

### Preferred approach (MVP)
- Use **Route Handlers** as the only backend surface:
  - They can safely call ChatPDF and issue signed URLs.
  - They can enforce authorization and shape responses for the UI.
- Use client-side fetching with a lightweight library (or plain `fetch`):
  - `SWR` or `React Query` recommended but optional.
  - Benefits: caching, revalidation, optimistic updates

### Server Components vs Client Components

**Server Components** (default in App Router):
- `/tables/page.tsx`: Fetch tables list server-side, pass to Client Component
- `/tables/[tableId]/page.tsx`: Fetch table metadata + schema server-side

**Client Components** (use `'use client'`):
- Interactive components: `SchemaEditor`, `UploadPanel`, `ExtractedRowsGrid`
- Components that need hooks: `useState`, `useEffect`, `useSWR`/`useQuery`
- Components that handle user input or real-time updates

### Data Fetching Patterns

**Server Components:**
```typescript
// app/tables/page.tsx
async function TablesPage() {
  const tables = await fetch('/api/tables').then(r => r.json())
  return <TablesListClient tables={tables} />
}
```

**Client Components:**
```typescript
// components/ExtractedRowsGrid.tsx
'use client'
function ExtractedRowsGrid({ tableId }) {
  const { data: rows, mutate } = useSWR(`/api/tables/${tableId}/rows`, fetcher)
  // ...
}
```

### TypeScript Types

**API Response Types** (`types/api.ts`):

```typescript
export interface Table {
  id: string
  table_name: string
  columns: Column[]
  created_at: string
  updated_at: string
}

export interface Column {
  label: string
  key: string
  desc: string
  order: number
}

export interface ExtractedRow {
  id: string
  table_id: string
  data: Record<string, string | number | null>
  is_verified: boolean
  status: 'uploaded' | 'extracting' | 'extracted' | 'failed'
  pdf_url?: string  // signed URL (expires)
  thumbnail_url?: string  // signed URL (expires)
  error?: string  // error message if status='failed'
  raw_response?: string  // truncated AI response for debugging
  created_at: string
  updated_at: string
}

export interface CreateTableRequest {
  table_name: string
  columns: Array<{ label: string; desc: string }>  // key generated server-side
}

export interface UpdateTableRequest {
  table_name?: string
  columns?: Column[]
}

export interface UpdateRowRequest {
  data?: Record<string, string | number | null>
  is_verified?: boolean
}
```

### Data shapes (frontend-facing)

**Table**
- `id: string`
- `table_name: string`
- `columns: Array<{ label: string; key: string; desc: string; order: number }>`
- `created_at: string`
- `updated_at: string`

**Row**
- `id: string`
- `table_id: string`
- `data: Record<string, string | number | null>`
- `is_verified: boolean`
- `status: 'uploaded'|'extracting'|'extracted'|'failed'`
- `pdf_url?: string` (signed; optional, expires)
- `thumbnail_url?: string` (signed; optional, expires)
- `error?: string` (if status='failed')
- `raw_response?: string` (truncated, for debugging)
- `created_at: string`
- `updated_at: string`

## Schema Change Behavior (critical)

Because rows store JSONB and schema changes can happen after rows exist:

- **Add column**: old rows show empty for that column until edited.
- **Delete column**: UI stops rendering it, but historical data can remain in JSONB.
- **Reorder columns**: only affects display order (no data rewrite).
- **Change key**: should be avoided in MVP; if supported, it must be explicit migration (copy old key → new key) or leave data unmigrated.

## Error States & Empty States

### Empty States
- **No tables**: show CTA to create one ("Create your first table")
- **No rows**: show "Upload a PDF to create your first row." with upload button
- **No columns in schema**: show warning in schema editor

### Error States

**Extraction failed** (`status='failed'`):
- Show row with red border/badge "Failed"
- Display error message from `row.error` (truncated if long)
- Show "Retry extraction" button (calls `/extract` endpoint again)
- Allow manual edits: user can fill in cells and verify
- Show "View raw response" link (opens modal with `raw_response` for debugging)

**Network/server errors:**
- Toast notification (e.g., "Failed to save changes. Please try again.")
- Inline error message with retry button
- For critical operations (create table, upload): show error in form/panel
- For non-critical (edit cell): show toast, allow retry

**Authentication errors:**
- Redirect to login if 401/403
- Show "Session expired" message

**Loading States:**
- Tables list: skeleton cards
- Table detail: skeleton for schema + grid
- Row extraction: spinner in UploadPanel + optimistic row in grid with `status='extracting'`
- Cell edit: show loading spinner on Save button
- Thumbnail: skeleton placeholder while image loads

## Utility Functions

### Slugify (Variable Key Generator)

**File**: `lib/utils/slugify.ts`

**Must match backend behavior** (see backend plan for exact implementation):

```typescript
export function generateVariableKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove special chars
    .replace(/[\s-]+/g, '_')   // Replace spaces/hyphens with underscores
    .replace(/^_+|_+$/g, '')   // Remove leading/trailing underscores
}
```

**Usage:**
- Called when user types column label in `SchemaEditor`
- Preview shown as read-only field
- Backend validates and normalizes again (ensures consistency)
- Enforce uniqueness: check existing columns in table before allowing duplicate keys

## Accessibility & UX Notes (MVP-friendly)

- Keyboard navigation in grid (at least tabbing between inputs).
- Visible focus states on cell editors and verify button.
- Confirmation dialog on schema delete column.

## Optimistic Updates & Real-time

### Optimistic Updates (MVP)
- **Create table**: Add to list immediately, rollback on error
- **Edit cell**: Update UI immediately, show loading on Save, rollback on error
- **Verify row**: Toggle verified state immediately, rollback on error
- **Upload + extract**: Add row to grid with `status='extracting'` immediately, update when extraction completes

### Real-time Updates (optional for MVP)
- Poll `/api/tables/[tableId]/rows` every 5-10 seconds while extraction in progress
- OR: Use Supabase Realtime subscriptions (more complex, better UX)
- OR: Use Server-Sent Events (SSE) from Route Handler (requires additional setup)

**MVP recommendation**: Simple polling for extraction status updates

## Visual Design Guidelines (simple)

### Color Scheme
- **Unverified**: yellow highlight (`bg-yellow-50` or `#fefce8`) + badge "Unverified"
- **Verified**: green highlight (`bg-green-50` or `#f0fdf4`) + badge "Verified"
- **Failed**: red border/badge (`border-red-200` or `#fee2e2`) + badge "Failed"
- **Extracting**: blue badge (`bg-blue-50`) + spinner icon

### Status Pills
- `uploaded`: Gray (`bg-gray-100`, text-gray-700)
- `extracting`: Blue (`bg-blue-100`, text-blue-700) + spinner
- `extracted`: Green (`bg-green-100`, text-green-700)
- `failed`: Red (`bg-red-100`, text-red-700)

### Layout
- Thumbnail column: fixed width (96px or 128px); sticky at end if grid is horizontally scrollable
- Schema editor: collapsible section or always visible (user preference)
- Upload panel: fixed at top or sidebar (depends on screen size)
- Grid: responsive table (horizontal scroll on mobile, full width on desktop)

### Typography
- Table name: large, bold
- Column labels: medium, semibold
- Cell values: regular, monospace for numbers/dates
- Status badges: small, uppercase

### Spacing
- Grid: compact rows (48px height), comfortable padding (8-12px)
- Schema editor: form-like spacing (16px between fields)
- Upload panel: card-like with padding (16-24px)

## Implementation Priorities (MVP)

### Phase 1: Core Functionality
1. Authentication setup (Supabase client)
2. Tables list page (`/tables`)
3. Create table form (`/tables/new`)
4. Table detail page shell (`/tables/[tableId]`)
5. Schema editor component (basic: add/edit/delete columns)
6. Upload panel (file select + upload)
7. Basic rows grid (read-only, no editing yet)

### Phase 2: Extraction & Display
8. Integration with `/extract` endpoint
9. Status handling (extracting/extracted/failed)
10. Thumbnail cell (server-generated thumbnails)
11. Signed URL handling for PDFs/thumbnails

### Phase 3: Review & Verification
12. Inline cell editing
13. Verify button + verification state
14. Error handling UI (failed extractions, retry)
15. Optimistic updates

### Phase 4: Polish
16. Loading states & skeletons
17. Empty states
18. Accessibility improvements
19. Responsive design refinements

## Testing Considerations (MVP)

### Manual Testing Checklist
- [ ] Create table with multiple columns
- [ ] Upload PDF and verify extraction
- [ ] Edit extracted values
- [ ] Verify row
- [ ] Test failed extraction (invalid PDF or ChatPDF error)
- [ ] Test schema changes (add/delete column) with existing rows
- [ ] Test signed URL expiry (wait 1+ hour or manually expire)
- [ ] Test authentication (login/logout, session expiry)

### Edge Cases
- Very long column names (truncate in UI)
- Very long extracted values (truncate with "..." or expand on click)
- Many columns (horizontal scroll)
- Many rows (pagination or virtual scrolling - optional for MVP)
- Concurrent edits (last write wins - acceptable for MVP)


