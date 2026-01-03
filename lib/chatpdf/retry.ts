/**
 * Retry utility for ChatPDF API calls
 * Implements bounded retries for transient errors (429/5xx)
 */

interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
  retryableStatusCodes?: number[]
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 1,
  retryDelay: 1000, // 1 second
  retryableStatusCodes: [429, 500, 502, 503, 504],
}

/**
 * Retry a function with exponential backoff
 * Only retries on specific HTTP status codes (429, 5xx)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if error is retryable
      const isRetryable = isRetryableError(error, opts.retryableStatusCodes)

      // If last attempt or not retryable, throw
      if (attempt >= opts.maxRetries || !isRetryable) {
        throw lastError
      }

      // Wait before retry (exponential backoff)
      const delay = opts.retryDelay * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Retry failed')
}

/**
 * Check if an error is retryable based on status code
 */
function isRetryableError(
  error: unknown,
  retryableStatusCodes: number[]
): boolean {
  if (error instanceof Error) {
    // Check if error message contains status code
    const statusMatch = error.message.match(/(\d{3})/)
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1], 10)
      return retryableStatusCodes.includes(statusCode)
    }
  }
  return false
}

