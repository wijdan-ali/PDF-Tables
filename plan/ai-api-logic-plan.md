# AI + API Logic Plan (ChatPDF + Next.js Route Handlers)

This document specifies the **ChatPDF extraction pipeline**, strict **prompting**, robust **sanitization/validation**, and the **Next.js Route Handler endpoint contracts** for the MVP described in [`plan/PRD.md`](plan/PRD.md).

## Goals

- Upload a PDF into a table context and extract data into a JSON object keyed by the table’s schema keys.
- Ensure the AI output is stored reliably even when responses are imperfect (markdown/prose/invalid JSON).
- Provide a clear retry/failure path and preserve raw AI output for debugging.
- Keep ChatPDF API keys and Storage signing server-side.

## Key Design Decisions

- **Strict schema-driven prompting**: prompt constructed from `user_tables.columns`.
- **JSON-only contract**: require one raw JSON object; missing fields must be `null`.
- **Sanitizer-first**: assume AI may return extra text; extract the first valid JSON object.
- **Validation**:
  - Only accept keys present in schema
  - Coerce missing schema keys to `null`
  - Optionally type-normalize later (MVP can store strings/numbers as-is)
- **Row status lifecycle** stored in DB:
  - `uploaded` → `extracting` → `extracted` or `failed`

## ChatPDF Integration (Conceptual)

ChatPDF API typically requires:
- Creating a “source” for a PDF (by file or URL)
- Sending a chat/message request referencing the source

The server will:
- create a signed read URL for the PDF from Storage
- create/lookup a ChatPDF source id
- send a message containing the dynamic prompt
- parse and validate response

## Prompt Strategy (Strict)

### Prompt template (server-generated)

Build from schema:
- For each column: `- {key}: {desc}`

Recommended prompt (single string):

```text
You are a data extraction engine.

Extract data from the provided document based on the schema below.

Rules:
1) Return ONLY one raw JSON object. No markdown fences, no explanations.
2) Output keys MUST exactly match the schema keys.
3) If a field is missing/unknown, set its value to null.
4) Values should be concise. Do not include surrounding commentary.

Schema (keys and descriptions):
- total_amount: The final amount including tax
- vendor: Vendor/company name
- invoice_date: Invoice date in ISO-8601 format (YYYY-MM-DD)

Return format:
{ "total_amount": 0, "vendor": "", "invoice_date": "" }
```

### Notes

- Encourage consistent dates (ISO-8601) and numerics, but do not over-constrain; store as returned for MVP.
- If you want stronger types later: add “Output types” rules and implement coercion/validation.

## Sanitization & Parsing (Robust)

### Inputs

- `responseText: string` from ChatPDF

### Sanitizer algorithm (MVP)

1) Trim whitespace.
2) Remove common markdown fences:
   - leading/trailing ```json / ``` blocks
3) Extract the **first JSON object**:
   - find first `{`
   - scan forward tracking brace depth until matching `}`
   - substring candidate
4) `JSON.parse(candidate)`
5) Ensure parsed value is a plain object (not array/null).

### Validation & normalization

Given:
- `schemaKeys = columns.map(c => c.key)`

Rules:
- Create `normalized = {}`
- For each `key in schemaKeys`:
  - if `parsed[key]` is `undefined` → `normalized[key] = null`
  - else `normalized[key] = parsed[key]`
- Ignore any `parsed` keys not in schema (or optionally record them in debug logs).

### Failure handling

If any step fails:
- Mark row `status='failed'`
- Store:
  - `error` (short message)
  - `raw_response` (truncated to a safe max length, e.g. 20k chars)
- UI shows “Extraction failed” with retry button.

## API Surface (Next.js Route Handlers)

All endpoints require auth (Supabase session). Routes are described conceptually; implement under `app/api/.../route.ts`.

### Tables

#### `GET /api/tables`
Returns user tables.

Response:
```json
{ "tables": [ { "id": "...", "table_name": "...", "columns": [ ... ] } ] }
```

#### `POST /api/tables`
Creates a table and schema.

Request:
```json
{
  "table_name": "Monthly Invoices",
  "columns": [
    { "label": "Total Amount", "desc": "The final amount including tax" },
    { "label": "Vendor", "desc": "Vendor/company name" }
  ]
}
```

Server:
- slugify `label` to `key`
- enforce uniqueness
- assign `order`

Response:
```json
{ "table": { "id": "...", "table_name": "...", "columns": [ ... ] } }
```

#### `PATCH /api/tables/:tableId`
Updates schema (add/edit/delete/reorder).

Request:
```json
{ "columns": [ { "label": "...", "key": "...", "desc": "...", "order": 1 } ] }
```

Response:
```json
{ "table": { "id": "...", "columns": [ ... ] } }
```

### Upload + Extraction

#### `POST /api/tables/:tableId/upload`
Creates a DB row and returns upload details.

Request:
```json
{ "filename": "invoice.pdf", "content_type": "application/pdf" }
```

Response (option A: signed upload URL):
```json
{
  "row_id": "...",
  "upload": { "url": "...", "method": "PUT", "headers": { "Content-Type": "application/pdf" } }
}
```

Response (option B: server handles upload; client sends multipart/form-data):
```json
{ "row_id": "...", "status": "uploaded" }
```

DB write:
- insert `extracted_rows` with `file_path` computed from user/table/row IDs
- set `status='uploaded'`

#### `POST /api/tables/:tableId/extract`
Triggers extraction for a given row.

Request:
```json
{ "row_id": "..." }
```

Server steps:
- set `status='extracting'`
- read table schema (`user_tables.columns`)
- sign PDF read URL from `file_path`
- call ChatPDF (add source, then chat/message with prompt)
- sanitize/parse/validate JSON
- generate/store thumbnail (default) and update `thumbnail_path`
- update row: `data`, `status='extracted'`, `raw_response` (optional), `error=null`

Response:
```json
{
  "row": {
    "id": "...",
    "status": "extracted",
    "data": { "total_amount": 150, "vendor": "Acme", "invoice_date": "2024-01-01" },
    "is_verified": false
  }
}
```

### Rows

#### `GET /api/tables/:tableId/rows`
Returns rows for a table, ideally including signed thumbnail URLs.

Response:
```json
{
  "rows": [
    {
      "id": "...",
      "data": { },
      "is_verified": false,
      "status": "extracted",
      "thumbnail_url": "...",
      "pdf_url": "...",
      "created_at": "..."
    }
  ]
}
```

#### `PATCH /api/rows/:rowId`
Edits data and/or verification state.

Request:
```json
{ "data": { "total_amount": 155 }, "is_verified": true }
```

Server:
- merge patch into existing JSONB (or replace full object depending on UI)

Response:
```json
{ "row": { "id": "...", "data": { ... }, "is_verified": true } }
```

## Retry / Backoff Guidance (MVP)

- UI retry button calls `/extract` again.
- Server can implement simple bounded retries for transient errors:
  - 1 immediate retry on 429/5xx with short delay
  - otherwise fail fast and surface error to user

## Security Notes

- ChatPDF API key and Supabase signing happen **only on server**.
- Keep Storage bucket private; return **signed URLs** in API responses.
- RLS should protect table/row access even if client tries arbitrary IDs.


