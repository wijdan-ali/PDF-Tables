/**
 * ChatPDF API Client
 * Handles communication with ChatPDF API for PDF extraction
 */

import { retryWithBackoff } from './retry'

const CHATPDF_API_BASE = 'https://api.chatpdf.com/v1'

interface ChatPDFSource {
  sourceId: string
}

interface ChatPDFMessage {
  content: string
  role: 'user' | 'assistant'
}

interface ChatPDFResponse {
  content: string
}

/**
 * Add a PDF source to ChatPDF by URL
 */
export async function addPDFSource(pdfUrl: string): Promise<string> {
  const apiKey = process.env.CHATPDF_API_KEY

  if (!apiKey) {
    throw new Error('CHATPDF_API_KEY is not configured')
  }

  return retryWithBackoff(async () => {
    const response = await fetch(`${CHATPDF_API_BASE}/sources/add-url`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: pdfUrl,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ChatPDF API error: ${response.status} ${errorText}`)
    }

    const data: ChatPDFSource = await response.json()
    return data.sourceId
  })
}

/**
 * Send a message to ChatPDF and get response
 */
export async function sendMessage(
  sourceId: string,
  message: string
): Promise<string> {
  const apiKey = process.env.CHATPDF_API_KEY

  if (!apiKey) {
    throw new Error('CHATPDF_API_KEY is not configured')
  }

  return retryWithBackoff(async () => {
    const response = await fetch(`${CHATPDF_API_BASE}/chats/message`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceId,
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ChatPDF API error: ${response.status} ${errorText}`)
    }

    const data: ChatPDFResponse = await response.json()
    return data.content
  })
}

/**
 * Extract data from PDF using ChatPDF
 * Combines add source and send message in one call
 */
export async function extractFromPDF(
  pdfUrl: string,
  prompt: string
): Promise<{ content: string; sourceId: string }> {
  // Add PDF source
  const sourceId = await addPDFSource(pdfUrl)

  // Send extraction prompt
  const content = await sendMessage(sourceId, prompt)

  return { content, sourceId }
}

