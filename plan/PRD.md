# Product Requirements Document (PRD)
**Project Name:** AI-Powered PDF Data Extractor (MVP)
**Version:** 1.0
**Status:** Draft / Planning
**Tech Stack:** Next.js (React), Supabase (PostgreSQL + JSONB), ChatPDF API.

---

## 1. Executive Summary
**Problem:** Users dealing with repetitive, semi-structured documents (invoices, receipts, legal forms) currently rely on manual data entry to move information from PDFs into structured databases (Excel/Notion). This is slow, error-prone, and tedious.

**Solution:** A web application that allows users to define custom data schemas (Tables). Users upload PDFs, and the application leverages the ChatPDF API to extract specific data points based on user descriptions, automatically populating the table rows in a structured format.

---

## 2. User User Flows & Core Features

### 2.1 Table & Schema Management
* **Create Table:** User creates a new "Table" (e.g., "Monthly Invoices").
* **Define Columns:** User adds columns to the table.
    * **Input:** Column Label (e.g., "Total Amount") and Description (e.g., "The final amount including tax").
    * **System Action:** The system automatically generates a machine-friendly `variable_key` (e.g., `total_amount`) using a slugify function (lowercase + underscores).
* **Edit Schema:** Users can add new columns, delete previous columns, change column positions in an existing table.

### 2.2 Document Ingestion & Extraction
* **Single File Upload:** User uploads a PDF document to a specific table context.
* **Dynamic Prompt Generation:** The system constructs a strict prompt for the ChatPDF API, injecting the user’s column descriptions and requesting a raw JSON output.
* **Extraction:** The AI processes the file and returns a JSON object mapped to the `variable_keys`.
* **Sanitization:** The backend cleans the AI response (strips Markdown/conversational text if any) and parses the JSON.

### 2.3 Data Review & Storage
* **Auto-Population:** The parsed JSON data is inserted as a new row in the database. At the very end, there must be a column where PDF's (the one one which the data is based) thumbnail is displayed
* **JSONB Storage:** Data is stored in a flexible JSONB column in Supabase, accommodating the custom schema without database migrations.
* **Human-in-the-Loop UI:** The new row appears in the frontend table.
    * *Visual Cue:* Data is highlighted (e.g., Yellow background) indicating "Unverified."
    * *Action:* User reviews, edits if necessary, and clicks "Verify" (Green background).

---

## 3. Technical Architecture

### 3.1 Tech Stack
| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | Next.js / React | Fast, component-based, great for building table UIs. |
| **Backend / DB** | Supabase | Provides Auth, PostgreSQL, and Storage out of the box. |
| **DB Feature** | **JSONB Columns** | Allows storage of flexible user-defined schemas without altering DB structure. |
| **AI Engine** | ChatPDF API | Handles PDF parsing, context management, and extraction efficiently. |

### 3.2 Database Schema (Supabase)
We will use a Relational approach for the *structure* and a NoSQL approach for the *data*.

**Table 1: `user_tables`**
*Stores the definition of the table.*
* `id` (UUID): Primary Key
* `user_id` (UUID): Foreign Key to Supabase Auth
* `table_name` (Text): e.g., "Vendor Contracts"
* `columns` (JSONB): Stores the schema definition.
    * *Structure:* `[{ "label": "Total", "key": "total", "desc": "Total cost" }, ...]`

**Table 2: `extracted_rows`**
*Stores the actual extracted data.*
* `id` (UUID): Primary Key
* `table_id` (UUID): Foreign Key to `user_tables`
* `file_url` (Text): Link to the stored PDF in Supabase Storage.
* `data` (JSONB): The actual extracted content.
    * *Structure:* `{ "total": 150.00, "vendor": "Acme", "date": "2024-01-01" }`
* `is_verified` (Boolean): Default `false`.

### 3.3 Key Algorithms

**A. Variable Key Generator (Slugify)**
Executed on the frontend/backend when a user creates a column. Basically take column's name and generate a code like name
```javascript
function generateVariableKey(column_name) {
  return label.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s-]+/g, '_'); // Replace spaces with underscores
}
```
### B. ChatPDF Prompt Strategy
The system must dynamically build this string for every API call:

> "You are a data extraction engine. Extract data from this document based on the following schema. Return ONLY a raw JSON object.
>
> **Fields to Extract:**
> - {variable_key_1}: {user_description_1}
> - {variable_key_2}: {user_description_2}
>
> **Output Format:**
> { "{variable_key_1}": "value", ... }"

---

## 4. API Logic Flow

1.  **POST /upload**
    * Client uploads PDF to Supabase Storage -> Returns Public URL.

2.  **POST /extract**
    * Client sends PDF URL + Table ID to backend.
    * Backend fetches column definitions from `user_tables`.
    * Backend calls ChatPDF API (`/v1/sources/add-file`) with URL.
    * Backend calls ChatPDF API (`/v1/chats/message`) with the **Dynamic Prompt**.
    * Backend receives string response -> Regex Sanitizer -> `JSON.parse()`.
    * Backend validates keys match schema.
    * Backend inserts into `extracted_rows`.

3.  **GET /rows**
    * Client fetches rows for the specific Table ID and renders them.

---

## 5. Non-Functional Requirements
* **Latency:** Extraction process should ideally take <15 seconds per page (dependent on ChatPDF latency).
* **Error Handling:** If AI returns invalid JSON, the system must fail gracefully (e.g., flag the row as "Extraction Failed" and allow manual entry).
* **Security:** Users can only access tables and rows where `user_id` matches their authenticated session (Row Level Security - RLS).

---

## 6. Success Metrics (MVP)
* **Extraction Accuracy:** % of fields that the user does *not* edit after extraction.
* **Time Saved:** Estimated time vs. manual entry (benchmarked at ~2 mins per doc manually).

---

## 7. Roadmap (Post-MVP)
* **Bulk Upload:** Drag and drop 50 PDFs at once.
* **Export:** Export table to CSV/Excel.
* **Webhooks:** Send verified data to Zapier/Slack.
