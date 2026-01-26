/**
 * ImagePreviewOverlay - In-app image preview for the link interceptor.
 *
 * Loads an image via data URL (from READ_FILE_DATA_URL IPC) and displays it
 * with fit-to-container sizing. Header shows the file path (clickable to open
 * externally) and action buttons for Reveal in Finder / Copy path.
 */

import * as React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { Image, FolderOpen } from 'lucide-react'
import { PreviewOverlay } from './PreviewOverlay'
import { CopyButton } from './CopyButton'
import { truncateFilePath } from '../code-viewer/language-map'

export interface ImagePreviewOverlayProps {
  isOpen: boolean
  onClose: () => void
  /** Absolute file path for the image */
  filePath: string
  /** Async loader that returns a data URL (data:{mime};base64,...) */
  loadDataUrl: (path: string) => Promise<string>
  /** Open the file in the default external application */
  onOpenExternal?: (path: string) => void
  /** Reveal the file in Finder / file manager */
  onRevealInFinder?: (path: string) => void
  theme?: 'light' | 'dark'
}

export function ImagePreviewOverlay({
  isOpen,
  onClose,
  filePath,
  loadDataUrl,
  onOpenExternal,
  onRevealInFinder,
  theme = 'light',
}: ImagePreviewOverlayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load the image data when the overlay opens or the path changes
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
          setError(err instanceof Error ? err.message : 'Failed to load image')
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [isOpen, filePath, loadDataUrl])

  const handleReveal = useCallback(() => {
    onRevealInFinder?.(filePath)
  }, [filePath, onRevealInFinder])

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
    </div>
  )

  return (
    <PreviewOverlay
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      badge={{
        icon: Image,
        label: 'Image',
        variant: 'purple',
      }}
      title={truncateFilePath(filePath)}
      onTitleClick={onOpenExternal ? () => onOpenExternal(filePath) : undefined}
      error={error ? { label: 'Load Failed', message: error } : undefined}
      headerActions={headerActions}
    >
      <div className="h-full flex items-center justify-center p-4 overflow-auto">
        {isLoading && (
          <div className="text-muted-foreground text-sm">Loading image...</div>
        )}
        {dataUrl && (
          <img
            src={dataUrl}
            alt={filePath.split('/').pop() ?? 'Image preview'}
            className="max-w-full max-h-full object-contain rounded-sm"
            draggable={false}
          />
        )}
      </div>
    </PreviewOverlay>
  )
}
