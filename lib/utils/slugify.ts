/**
 * Generate a machine-friendly variable key from a user-facing label.
 * Must match backend behavior exactly.
 */
export function generateVariableKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s-]+/g, '_') // Replace spaces/hyphens with underscores
    .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
}

