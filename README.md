# PDF Tables - AI-Powered Data Extractor

A Next.js application that allows users to extract structured data from PDFs using AI (ChatPDF API). Users can define custom schemas, upload PDFs, and review/verify extracted data in a table format.

## Features

- **Custom Table Schemas**: Create tables with custom columns and descriptions
- **PDF Upload & Extraction**: Upload PDFs and extract data using ChatPDF API
- **Human-in-the-Loop Review**: Review, edit, and verify extracted data
- **PDF Thumbnails**: Visual preview of source PDFs

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js Route Handlers
- **Database**: Supabase (PostgreSQL with JSONB)
- **Storage**: Supabase Storage
- **Authentication**: Supabase Auth
- **AI**: ChatPDF API

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account and project
- ChatPDF API key

### Installation

1. **Clone the repository** (if applicable) or navigate to the project directory

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   - Copy `.env.example` to `.env.local`
   - Fill in your Supabase and ChatPDF credentials:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
     CHATPDF_API_KEY=your_chatpdf_api_key
     ```

4. **Set up Supabase Database**:
   - See detailed instructions in [`supabase/README.md`](supabase/README.md)
   - Run migrations in order:
     1. `supabase/migrations/001_initial_schema.sql` - Creates tables
     2. `supabase/migrations/002_rls_policies.sql` - Sets up RLS
   - Set up Storage bucket (see [`supabase/storage_setup.md`](supabase/storage_setup.md))

5. **Run the development server**:
   ```bash
   npm run dev
   ```

6. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
app/
  api/                    # Next.js Route Handlers
    tables/              # Table management endpoints
    rows/                # Row management endpoints
  tables/                # Table pages
    [tableId]/           # Table detail page
      components/        # Table-specific components
  login/                 # Authentication page
lib/
  supabase/              # Supabase client configuration
  utils/                 # Utility functions
supabase/
  migrations/            # SQL migration files
   001_initial_schema.sql
   002_rls_policies.sql
  storage_setup.md       # Storage bucket setup guide
  README.md              # Database setup instructions
types/                   # TypeScript type definitions
plan/                    # Planning documents
```

## Key Components

- **SchemaEditor**: Manage table columns (add, edit, delete, reorder)
- **UploadPanel**: Upload PDFs and trigger extraction
- **ExtractedRowsGrid**: Display and edit extracted data rows
- **PdfThumbnailCell**: Display PDF thumbnails

## API Endpoints

- `POST /api/tables` - Create a new table
- `GET /api/tables` - List all user tables
- `GET /api/tables/[tableId]` - Get table details
- `PATCH /api/tables/[tableId]` - Update table schema
- `POST /api/tables/[tableId]/upload` - Upload PDF
- `POST /api/tables/[tableId]/extract` - Trigger AI extraction
- `GET /api/tables/[tableId]/rows` - Get extracted rows
- `PATCH /api/rows/[rowId]` - Update row data or verification status

## Development Status

The frontend is fully implemented according to `plan/frontend-plan.md`. The ChatPDF integration in the extract endpoint is a placeholder and needs to be completed based on `plan/ai-api-logic-plan.md`.

## Next Steps

1. Complete ChatPDF API integration (see `plan/ai-api-logic-plan.md`)
2. Implement thumbnail generation (server-side PDF rendering)
3. Add error handling and retry logic
4. Implement export functionality (CSV/Excel)
5. Add bulk upload support

## Documentation

- [PRD](plan/PRD.md) - Product Requirements Document
- [App Architecture](plan/app-architecture.md) - System architecture
- [Frontend Plan](plan/frontend-plan.md) - Frontend implementation plan
- [Backend/Database Plan](plan/backend-database-plan.md) - Database schema and setup
- [AI/API Logic Plan](plan/ai-api-logic-plan.md) - ChatPDF integration plan

## License

MIT
