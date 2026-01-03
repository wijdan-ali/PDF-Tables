/**
 * Prompt Builder for ChatPDF
 * Constructs strict extraction prompts from table schema
 */

interface Column {
  key: string
  desc: string
}

/**
 * Build extraction prompt from schema columns
 */
export function buildExtractionPrompt(columns: Column[]): string {
  if (columns.length === 0) {
    throw new Error('Schema must have at least one column')
  }

  // Build schema section
  const schemaLines = columns
    .map((col) => `- ${col.key}: ${col.desc}`)
    .join('\n')

  // Build example output format
  const exampleKeys = columns.map((col) => `"${col.key}": ""`).join(', ')
  const exampleFormat = `{ ${exampleKeys} }`

  const prompt = `You are a data extraction engine.

Extract data from the provided document based on the schema below.

Rules:
1) Return ONLY one raw JSON object. No markdown fences, no explanations.
2) Output keys MUST exactly match the schema keys.
3) If a field is missing/unknown, set its value to null.
4) Values should be concise. Do not include surrounding commentary.

Schema (keys and descriptions):
${schemaLines}

Return format:
${exampleFormat}`

  return prompt
}

