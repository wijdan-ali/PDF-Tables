'use client'

import { useState } from 'react'
import type { UploadResponse, ExtractResponse } from '@/types/api'

interface UploadPanelProps {
  tableId: string
}

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'extracting' | 'done' | 'failed'

export default function UploadPanel({ tableId }: UploadPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [rowId, setRowId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile)
      setError(null)
    } else {
      setError('Please select a PDF file')
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setState('uploading')
    setError(null)
    setProgress(0)

    try {
      // Step 1: Create row and get upload URL
      const uploadResponse = await fetch(`/api/tables/${tableId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
        }),
      })

      if (!uploadResponse.ok) {
        const data = await uploadResponse.json()
        throw new Error(data.error || 'Failed to initiate upload')
      }

      const uploadData: UploadResponse = await uploadResponse.json()
      setRowId(uploadData.row_id)
      setProgress(50)

      // Step 2: Upload file to Storage (if signed URL provided)
      if (uploadData.upload_url) {
        const uploadResult = await fetch(uploadData.upload_url, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': 'application/pdf',
          },
        })

        if (!uploadResult.ok) {
          throw new Error('Failed to upload file to storage')
        }
      } else {
        // Server-side upload: send file directly
        const formData = new FormData()
        formData.append('file', file)
        formData.append('row_id', uploadData.row_id)

        const serverUploadResponse = await fetch(`/api/tables/${tableId}/upload`, {
          method: 'POST',
          body: formData,
        })

        if (!serverUploadResponse.ok) {
          throw new Error('Failed to upload file')
        }
      }

      setState('uploaded')
      setProgress(100)

      // Step 3: Trigger extraction
      await handleExtract(uploadData.row_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('failed')
    }
  }

  const handleExtract = async (targetRowId: string) => {
    setState('extracting')
    setError(null)

    try {
      const response = await fetch(`/api/tables/${tableId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_id: targetRowId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Extraction failed')
      }

      const extractData: ExtractResponse = await response.json()

      if (extractData.status === 'failed') {
        setError(extractData.error || 'Extraction failed')
        setState('failed')
      } else if (extractData.status === 'extracted') {
        setState('done')
        // Refresh the rows grid (parent component should handle this)
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        // Still extracting - poll for status
        pollExtractionStatus(targetRowId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
      setState('failed')
    }
  }

  const pollExtractionStatus = async (targetRowId: string) => {
    const maxAttempts = 30 // 30 attempts = ~30 seconds
    let attempts = 0

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setError('Extraction timed out')
        setState('failed')
        return
      }

      try {
        const response = await fetch(`/api/tables/${tableId}/rows/${targetRowId}`)
        if (!response.ok) throw new Error('Failed to fetch row status')

        const row = await response.json()
        if (row.status === 'extracted') {
          setState('done')
          setTimeout(() => {
            window.location.reload()
          }, 1000)
        } else if (row.status === 'failed') {
          setError(row.error || 'Extraction failed')
          setState('failed')
        } else {
          attempts++
          setTimeout(poll, 1000)
        }
      } catch (err) {
        attempts++
        setTimeout(poll, 1000)
      }
    }

    poll()
  }

  const handleRetry = () => {
    if (rowId) {
      handleExtract(rowId)
    } else {
      handleUpload()
    }
  }

  const reset = () => {
    setFile(null)
    setState('idle')
    setRowId(null)
    setError(null)
    setProgress(0)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select PDF File
        </label>
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          disabled={state === 'uploading' || state === 'extracting'}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
      </div>

      {file && state === 'idle' && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{file.name}</span>
          <button
            onClick={handleUpload}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upload & Extract
          </button>
        </div>
      )}

      {(state === 'uploading' || state === 'extracting') && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-600">
              {state === 'uploading' ? 'Uploading...' : 'Extracting data...'}
            </span>
          </div>
          {state === 'uploading' && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      {state === 'done' && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          ✓ Extraction completed successfully!
        </div>
      )}

      {state === 'failed' && (
        <div className="space-y-2">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            {error || 'An error occurred'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {error && state !== 'failed' && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

