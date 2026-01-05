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
  row_order?: number
  pdf_url?: string // signed URL (expires)
  thumbnail_url?: string // signed URL (expires)
  error?: string // error message if status='failed'
  raw_response?: string // truncated AI response for debugging
  created_at: string
  updated_at: string
}

export interface CreateTableRequest {
  table_name: string
  columns: Array<{ label: string; desc: string }> // key generated server-side
}

export interface UpdateTableRequest {
  table_name?: string
  columns?: Column[]
}

export interface UpdateRowRequest {
  data?: Record<string, string | number | null>
  is_verified?: boolean
  row_order?: number
}

export interface UploadResponse {
  row_id: string
  upload_url?: string // signed upload URL if client-side upload
}

export interface ExtractResponse {
  status: 'extracting' | 'extracted' | 'failed'
  data?: Record<string, string | number | null>
  error?: string
}

