# App Architecture (MVP)

This document describes the architecture for the **AI-Powered PDF Data Extractor (MVP)** described in [`plan/PRD.md`](plan/PRD.md).

## Goals (from PRD)

- Let users create **custom tables** with **custom columns** (schema) without DB migrations.
- Let users upload PDFs to a table, run **AI extraction** (ChatPDF), and store results as **rows**.
- Provide a **human-in-the-loop review**: unverified rows are highlighted; user can edit and verify.
- Show a **PDF thumbnail** at the end of each row (row is based on a PDF).

## Tech Stack (chosen)

- **Frontend**: Next.js (App Router) + React
- **Backend**: Next.js Route Handlers (`app/api/**/route.ts`)
- **Database**: Supabase Postgres (JSONB) + Row Level Security
- **Storage**: Supabase Storage (PDFs + thumbnails)
- **AI**: ChatPDF API

## Core Entities (conceptual)

- **User**: Supabase Auth identity.
- **UserTable**: A user-defined table (name + schema).
- **Column**: A schema entry inside `UserTable.columns` (JSONB array).
- **ExtractedRow**: A data row for a table; holds the PDF reference + extracted JSON.

## System Components

### Client (Browser / Next.js UI)

- Table list UI
- Schema editor UI (add/edit/delete/reorder columns)
- Upload UI (PDF upload to table)
- Table grid UI (rows; “unverified” highlight; edit + verify)
- Thumbnail cell UI (image preview + link to PDF)

### Server (Next.js Route Handlers)

- Issues **signed upload URLs** or performs server-side upload to Storage
- Calls Supabase (DB) with **service role** only where needed (e.g., server-side operations), otherwise uses RLS with user session
- Calls ChatPDF API (keeps API key server-side)
- Sanitizes and validates AI responses; writes rows to DB

### Supabase (Managed)

- Auth: sessions, JWTs, user management
- Postgres: `user_tables`, `extracted_rows`
- Storage: private bucket for PDFs and thumbnails
- RLS: ensures users only read/write their own tables and rows

## High-Level Architecture Diagram

```mermaid
flowchart LR
  user[UserBrowser] --> ui[NextjsUI_AppRouter]

  ui --> api[NextjsRouteHandlers_API]
  api --> auth[SupabaseAuth]
  api --> db[SupabasePostgres]
  api --> storage[SupabaseStorage]
  api --> chatpdf[ChatPDF_API]

  ui -->|optional direct read via signed URL| storage
```

## End-to-End Flows

### 1) Create Table + Schema

```mermaid
sequenceDiagram
  participant U as UserBrowser
  participant UI as NextjsUI
  participant API as NextjsAPI
  participant DB as SupabasePostgres

  U->>UI: Enter table name + columns (label, description)
  UI->>API: POST /api/tables {table_name, columns[]}
  API->>API: Validate columns + generate/normalize variable keys
  API->>DB: INSERT user_tables (user_id, table_name, columns)
  DB-->>API: user_table row
  API-->>UI: 201 created
```

Key rules:
- Each column has:
  - `label` (user-facing)
  - `key` (machine-friendly, slugified, unique within table)
  - `desc` (extraction guidance)
  - `order` (integer for deterministic rendering)

### 2) Upload PDF → Extract → Store Row

```mermaid
sequenceDiagram
  participant U as UserBrowser
  participant UI as NextjsUI
  participant API as NextjsAPI
  participant ST as SupabaseStorage
  participant DB as SupabasePostgres
  participant AI as ChatPDF_API

  U->>UI: Select PDF for Table
  UI->>API: POST /api/tables/:tableId/upload (metadata)
  API->>ST: Create signed upload URL or upload server-side
  ST-->>API: file path (private) + storage metadata
  API->>DB: INSERT extracted_rows (table_id, file_path, thumbnail_path, status='uploaded')
  DB-->>API: row_id
  API-->>UI: {row_id, upload_url?}

  UI->>ST: Upload PDF (if using signed upload URL)
  UI->>API: POST /api/tables/:tableId/extract {row_id}
  API->>DB: SELECT user_tables.columns + row file_path
  API->>ST: Create signed read URL for PDF
  API->>AI: Add PDF source + send prompt
  AI-->>API: response text (expected JSON)
  API->>API: Sanitize + parse + validate keys
  API->>ST: Generate/store thumbnail (default) OR record client-render plan
  API->>DB: UPDATE extracted_rows SET data=JSONB, status='extracted', raw_response=?, error=?, thumbnail_path=?
  API-->>UI: {status, data}
```

Default design choice:
- **Private Storage + signed URLs** for reading PDFs/thumbnails.

### 3) Review → Edit → Verify

```mermaid
sequenceDiagram
  participant U as UserBrowser
  participant UI as NextjsUI
  participant API as NextjsAPI
  participant DB as SupabasePostgres

  U->>UI: Open table detail page
  UI->>API: GET /api/tables/:tableId/rows
  API->>DB: SELECT extracted_rows for table_id (RLS enforced)
  DB-->>API: rows
  API-->>UI: rows

  U->>UI: Edit cells in row + click Verify
  UI->>API: PATCH /api/rows/:rowId {data_patch, is_verified:true}
  API->>DB: UPDATE extracted_rows SET data=..., is_verified=true
  DB-->>API: updated row
  API-->>UI: updated row (UI renders “verified” state)
```

## Security Model

### Authentication

- Browser uses Supabase Auth session (JWT).
- Next.js Route Handlers authenticate requests by validating the user session (via Supabase server client).

### Authorization (RLS)

Use RLS to ensure:
- A user can only access `user_tables` where `user_tables.user_id = auth.uid()`.
- A user can only access `extracted_rows` that belong to a table they own (via join to `user_tables`).

### Secrets

- ChatPDF API key is **server-only** (environment variable).
- Supabase service role key (if used) is **server-only** and only used when absolutely required.

### Storage Access

Default:
- Storage bucket is **private**.
- Server issues **signed URLs** for read/download and (optionally) signed upload URLs.

Alternative (not recommended for sensitive docs):
- Public bucket with `file_url` stored as public link.

## Storage Strategy (PDFs + Thumbnails)

### Bucket layout (recommended)

- Bucket: `documents` (private)
- Paths:
  - PDFs: `user/{user_id}/table/{table_id}/row/{row_id}.pdf`
  - Thumbnails: `user/{user_id}/table/{table_id}/row/{row_id}.png`

### Thumbnail Strategy (requirement)

**Default: server-generated thumbnail**
- Pros: consistent UI, simple rendering, cheap for client, no PDF.js setup.
- Cons: requires a server-side PDF render step (implementation complexity).

**Alternative: client-rendered thumbnail (PDF.js)**
- Pros: no server-side rendering, easier infra.
- Cons: heavier client bundle, CORS/signed URL complexity, slower for large PDFs.

The MVP plans will assume **server-generated thumbnails** are stored in Storage and referenced in each row. If thumbnail generation is deferred, the UI can show a placeholder icon linking to the PDF.

## Reliability & Failure Modes

### AI extraction failures

Common failure cases:
- ChatPDF returns non-JSON (markdown, prose, partial).
- Missing/extra keys compared to schema.
- Timeouts / rate limits.

Mitigation:
- Store `raw_response` and `error` on the row.
- Add a `status` field on `extracted_rows` (`uploaded|extracting|extracted|failed`).
- UI shows a “failed” badge and allows manual entry + retry.

### Schema changes after rows exist

Because schema is JSONB:
- Adding a column: older rows simply render `null/empty` for that column.
- Renaming a key: requires migration logic (prefer “add new column + deprecate old”).
- Deleting a column: keep historical data in row JSON, but UI hides deleted columns.

## Observability (MVP)

- Server logs per request:
  - table_id, row_id
  - ChatPDF latency + status
  - sanitizer parse outcomes
- Store minimal fields on row:
  - `status`, `error`, `raw_response` (truncated), timestamps


