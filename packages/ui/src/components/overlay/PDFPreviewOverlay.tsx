/**
 * PDFPreviewOverlay - In-app PDF preview for the link interceptor.
 *
 * Loads a PDF via data URL (from READ_FILE_DATA_URL IPC) and embeds it
 * using Chromium's built-in PDF viewer. Falls back to an error message
 * with an "Open externally" button if rendering fails.
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { FileText, FolderOpen, ExternalLink } from 'lucide-react'
import { PreviewOverlay } from './PreviewOverlay'
import { CopyButton } from './CopyButton'
import { truncateFilePath } from '../code-viewer/language-map'

export interface PDFPreviewOverlayProps {
  isOpen: boolean
  onClose: () => void
  /** Absolute file path for the PDF */
  filePath: string
  /** Async loader that returns a data URL (data:application/pdf;base64,...) */
  loadDataUrl: (path: string) => Promise<string>
  /** Open the file in the default external application */
  onOpenExternal?: (path: string) => void
  /** Reveal the file in Finder / file manager */
  onRevealInFinder?: (path: string) => void
  theme?: 'light' | 'dark'
}

export function PDFPreviewOverlay({
  isOpen,
  onClose,
  filePath,
  loadDataUrl,
  onOpenExternal,
  onRevealInFinder,
  theme = 'light',
}: PDFPreviewOverlayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load the PDF data when the overlay opens or the path changes
  useEffect(() => {
    if (!isOpen || !filePath) return

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setDataUrl(null)

    loadDataUrl(filePath)
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF')
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [isOpen, filePath, loadDataUrl])

  const handleReveal = useCallback(() => {
    onRevealInFinder?.(filePath)
  }, [filePath, onRevealInFinder])

  const handleOpenExternal = useCallback(() => {
    onOpenExternal?.(filePath)
  }, [filePath, onOpenExternal])

  const headerActions = (
    <div className="flex items-center gap-0.5">
      <CopyButton content={filePath} title="Copy path" />
      {onRevealInFinder && (
        <button
          onClick={handleReveal}
          className="flex items-center justify-center w-7 h-7 rounded-[6px] transition-colors shrink-0 select-none text-muted-foreground hover:text-foreground hover:bg-foreground/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="Reveal in Finder"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
      )}
      {onOpenExternal && (
        <button
          onClick={handleOpenExternal}
          className="flex items-center justify-center w-7 h-7 rounded-[6px] transition-colors shrink-0 select-none text-muted-foreground hover:text-foreground hover:bg-foreground/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="Open in Preview"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )

  return (
    <PreviewOverlay
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      badge={{
        icon: FileText,
        label: 'PDF',
        variant: 'orange',
      }}
      title={truncateFilePath(filePath)}
      onTitleClick={onOpenExternal ? () => onOpenExternal(filePath) : undefined}
      error={error ? { label: 'Load Failed', message: error } : undefined}
      headerActions={headerActions}
    >
      <div className="h-full flex flex-col">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Loading PDF...</span>
          </div>
        )}
        {/* Embed PDF using Chromium's built-in PDF viewer */}
        {dataUrl && (
          <embed
            src={dataUrl}
            type="application/pdf"
            className="flex-1 w-full min-h-0"
          />
        )}
      </div>
    </PreviewOverlay>
  )
}
