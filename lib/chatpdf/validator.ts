/**
 * Schema Validator and Normalizer
 * Validates extracted data against schema and normalizes missing fields
 */

interface Column {
  key: string
  desc: string
}

/**
 * Validate and normalize extracted data against schema
 * - Only accepts keys present in schema
 * - Sets missing schema keys to null
 * - Ignores extra keys not in schema
 */
export function validateAndNormalize(
  extractedData: Record<string, any>,
  schemaColumns: Column[]
): Record<string, any> {
  const schemaKeys = schemaColumns.map((col) => col.key)
  const normalized: Record<string, any> = {}

  // For each key in schema, get value from extracted data or set to null
  for (const key of schemaKeys) {
    if (extractedData[key] === undefined) {
      normalized[key] = null
    } else {
      normalized[key] = extractedData[key]
    }
  }

  // Note: We intentionally ignore keys in extractedData that aren't in schema
  // This prevents schema pollution while preserving flexibility

  return normalized
}

/**
 * Check if all required schema keys are present (even if null)
 * This is always true after normalization, but useful for validation
 */
export function hasAllSchemaKeys(
  data: Record<string, any>,
  schemaColumns: Column[]
): boolean {
  const schemaKeys = schemaColumns.map((col) => col.key)
  return schemaKeys.every((key) => key in data)
}

