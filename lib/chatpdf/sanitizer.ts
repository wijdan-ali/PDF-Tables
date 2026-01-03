/**
 * JSON Sanitizer and Parser
 * Extracts and parses JSON from potentially messy AI responses
 */

export interface SanitizeResult {
  success: boolean
  data?: Record<string, any>
  error?: string
}

/**
 * Sanitize and extract JSON from AI response
 * Handles markdown fences, extra text, and malformed JSON
 */
export function sanitizeAndParseJSON(responseText: string): SanitizeResult {
  try {
    // Step 1: Trim whitespace
    let cleaned = responseText.trim()

    // Step 2: Remove markdown code fences
    // Remove leading ```json or ```
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '')
    // Remove trailing ```
    cleaned = cleaned.replace(/\s*```$/i, '')

    // Step 3: Extract first JSON object
    const jsonStart = cleaned.indexOf('{')
    if (jsonStart === -1) {
      return {
        success: false,
        error: 'No JSON object found in response',
      }
    }

    // Find matching closing brace
    let braceDepth = 0
    let jsonEnd = -1

    for (let i = jsonStart; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        braceDepth++
      } else if (cleaned[i] === '}') {
        braceDepth--
        if (braceDepth === 0) {
          jsonEnd = i + 1
          break
        }
      }
    }

    if (jsonEnd === -1) {
      return {
        success: false,
        error: 'Unclosed JSON object in response',
      }
    }

    // Extract JSON substring
    const jsonCandidate = cleaned.substring(jsonStart, jsonEnd)

    // Step 4: Parse JSON
    let parsed: any
    try {
      parsed = JSON.parse(jsonCandidate)
    } catch (parseError) {
      return {
        success: false,
        error: `JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      }
    }

    // Step 5: Ensure it's a plain object (not array/null)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        success: false,
        error: 'Parsed value is not a plain object',
      }
    }

    return {
      success: true,
      data: parsed,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown sanitization error',
    }
  }
}

/**
 * Truncate string to safe length for storage
 */
export function truncateForStorage(text: string, maxLength: number = 20000): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.substring(0, maxLength) + '... [truncated]'
}

