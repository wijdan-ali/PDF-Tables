'use client'

import { usePdfThumbnail } from './usePdfThumbnail'

interface PdfThumbnailCellProps {
  thumbnailUrl?: string
  pdfUrl?: string
  filename?: string
}

export default function PdfThumbnailCell({
  thumbnailUrl,
  pdfUrl,
  filename = 'document.pdf',
}: PdfThumbnailCellProps) {
  const { thumbForPreview, isLoading, imageError, setImageError, setIsLoading } = usePdfThumbnail({
    thumbnailUrl,
    pdfUrl,
  })

  const handleClick = () => {
    const url = pdfUrl
    if (url) {
      window.open(url, '_blank')
    }
  }

  // Fallback: stable PDF icon
  if (!thumbForPreview || imageError) {
    return (
      <div
        onClick={handleClick}
        className="w-24 h-24 flex items-center justify-center bg-muted border border-border rounded cursor-pointer hover:bg-accent transition-colors"
        title={filename}
      >
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      className="w-24 h-24 relative border border-border rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
      title={filename}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin"></div>
        </div>
      )}
      <img
        src={thumbForPreview}
        alt={filename}
        className={`w-full h-full object-cover ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setImageError(true)
          setIsLoading(false)
        }}
      />
    </div>
  )
}



