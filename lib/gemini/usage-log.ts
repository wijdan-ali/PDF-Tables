import { promises as fs } from 'fs'
import path from 'path'

export type GeminiUsageRow = {
  ts: string
  model: string
  tableId?: string
  rowId?: string
  promptTokenCount?: number
  candidatesTokenCount?: number
  cachedContentTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
}

const LOG_FILENAME = 'gemini-usage.csv'

function csvEscape(v: string) {
  if (v.includes('"') || v.includes(',') || v.includes('\n')) return `"${v.replace(/"/g, '""')}"`
  return v
}

export async function appendGeminiUsage(row: GeminiUsageRow) {
  const filePath = path.join(process.cwd(), LOG_FILENAME)
  const header =
    'ts,model,table_id,row_id,prompt_tokens,candidates_tokens,cached_tokens,thoughts_tokens,total_tokens\n'

  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, header, 'utf8')
  }

  const line = [
    csvEscape(row.ts),
    csvEscape(row.model),
    csvEscape(row.tableId ?? ''),
    csvEscape(row.rowId ?? ''),
    String(row.promptTokenCount ?? ''),
    String(row.candidatesTokenCount ?? ''),
    String(row.cachedContentTokenCount ?? ''),
    String(row.thoughtsTokenCount ?? ''),
    String(row.totalTokenCount ?? ''),
  ].join(',') + '\n'

  await fs.appendFile(filePath, line, 'utf8')
}

