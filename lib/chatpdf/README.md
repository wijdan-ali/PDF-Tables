# ChatPDF Integration

This directory contains the ChatPDF API integration for PDF data extraction.

## Files

### `client.ts`
- **`addPDFSource(pdfUrl: string)`**: Adds a PDF to ChatPDF by URL, returns sourceId
- **`sendMessage(sourceId: string, message: string)`**: Sends a message to ChatPDF and returns response
- **`extractFromPDF(pdfUrl: string, prompt: string)`**: Combined function that adds source and sends message

### `prompt-builder.ts`
- **`buildExtractionPrompt(columns: Column[])`**: Builds a strict extraction prompt from table schema
- Ensures JSON-only output with exact key matching
- Includes schema descriptions for accurate extraction

### `sanitizer.ts`
- **`sanitizeAndParseJSON(responseText: string)`**: Extracts and parses JSON from AI responses
- Handles markdown fences, extra text, and malformed JSON
- Returns structured result with success/error status
- **`truncateForStorage(text: string, maxLength?: number)`**: Truncates long responses for database storage

### `validator.ts`
- **`validateAndNormalize(data: Record<string, any>, schemaColumns: Column[])`**: Validates extracted data against schema
- Only accepts keys present in schema
- Sets missing schema keys to `null`
- Ignores extra keys not in schema

### `retry.ts`
- **`retryWithBackoff(fn: () => Promise<T>, options?: RetryOptions)`**: Retries API calls with exponential backoff
- Only retries on transient errors (429, 5xx)
- Configurable max retries and delay

## Usage

The integration is used in `/api/tables/[tableId]/extract` route:

1. Build prompt from table schema
2. Call ChatPDF API (with retry logic)
3. Sanitize and parse JSON response
4. Validate and normalize against schema
5. Store in database with status tracking

## Error Handling

- **API Errors**: Retried once for transient errors (429, 5xx)
- **Parse Errors**: Stored with raw response for debugging
- **Validation Errors**: Missing keys set to `null`, extra keys ignored
- **All Errors**: Stored in `extracted_rows.error` and `raw_response` fields

## Environment Variables

Requires `CHATPDF_API_KEY` in `.env.local`:

```env
CHATPDF_API_KEY=your_chatpdf_api_key_here
```

## API Endpoints Used

- `POST /v1/sources/add-url` - Add PDF source by URL
- `POST /v1/chats/message` - Send message and get response

