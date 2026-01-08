function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function uploadRemotePDF(ai: any, url: string, displayName: string) {
  const pdfBuffer = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch PDF: ${r.status} ${r.statusText}`)
    return r.arrayBuffer()
  })

  const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' })

  const file = await ai.files.upload({
    // Gemini SDK expects a Blob/File-like
    file: fileBlob as any,
    config: { displayName },
  })

  // Wait for the file to be processed (bounded polling).
  let getFile = await ai.files.get({ name: (file as any).name })
  let tries = 0
  while ((getFile as any).state === 'PROCESSING' && tries < 24) {
    tries += 1
    await sleep(2500)
    getFile = await ai.files.get({ name: (file as any).name })
  }

  if ((getFile as any).state === 'FAILED') {
    throw new Error('Gemini file processing failed.')
  }
  if ((getFile as any).state === 'PROCESSING') {
    throw new Error('Gemini file processing timed out.')
  }

  return getFile
}

function pickUsageMetadata(resp: any) {
  return resp?.usageMetadata ?? resp?.response?.usageMetadata ?? resp?.data?.usageMetadata ?? null
}

export async function extractFromPDFGemini(
  pdfUrl: string,
  prompt: string,
  opts?: { displayName?: string; model?: string; tableId?: string; rowId?: string }
): Promise<{ content: string; fileName?: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY')
  }

  // Dynamic import to avoid bundling/SSR issues during prerender/build.
  const { GoogleGenAI, createPartFromUri } = (await import('@google/genai')) as any
  const { appendGeminiUsage } = await import('./usage-log')

  const ai = new GoogleGenAI({ apiKey })
  const model = opts?.model ?? 'gemini-2.5-flash'
  const displayName = opts?.displayName ?? 'PDF'

  const file = await uploadRemotePDF(ai, pdfUrl, displayName)
  const uri = (file as any).uri
  const mimeType = (file as any).mimeType
  if (!uri || !mimeType) {
    throw new Error('Gemini file upload did not return uri/mimeType.')
  }

  const filePart = createPartFromUri(uri, mimeType)

  // The SDK accepts a simple array of parts/strings as shown in the docs.
  const contents: any = [prompt, filePart]

  const response: any = await ai.models.generateContent({
    model,
    contents,
  })

  // Best-effort token logging to repo-root `gemini-usage.csv`
  try {
    const usage = pickUsageMetadata(response)
    if (usage) {
      await appendGeminiUsage({
        ts: new Date().toISOString(),
        model,
        tableId: opts?.tableId,
        rowId: opts?.rowId,
        promptTokenCount: usage.promptTokenCount,
        candidatesTokenCount: usage.candidatesTokenCount,
        cachedContentTokenCount: usage.cachedContentTokenCount,
        thoughtsTokenCount: usage.thoughtsTokenCount,
        totalTokenCount: usage.totalTokenCount,
      })
    } else {
      await appendGeminiUsage({
        ts: new Date().toISOString(),
        model,
        tableId: opts?.tableId,
        rowId: opts?.rowId,
      })
    }
  } catch {
    // ignore logging failures
  }

  const text =
    typeof response?.text === 'function'
      ? await response.text()
      : typeof response?.text === 'string'
        ? response.text
        : response?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') ?? ''

  if (!text) {
    throw new Error('Gemini returned an empty response.')
  }

  return { content: text, fileName: (file as any).name }
}

