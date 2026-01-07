import * as React from 'react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { BookOpen, PenLine, PencilLine, FilePlus, XCircle, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuTrigger, StyledDropdownMenuContent, StyledDropdownMenuItem } from '@/components/ui/styled-dropdown'
import { WindowHeader, WindowHeaderBadge } from '@/components/ui/window-header-badge'
import { formatFilePath } from '@/lib/file-utils'
import { ShikiCodeViewer, ShikiDiffViewer } from '@/components/shiki'
import type { FilePreviewData, FileChange } from '../../../shared/types'

interface FilePreviewAppProps {
  sessionId: string
  previewId: string
}

// ============================================
// Sidebar Components (for multi-diff mode)
// ============================================

interface SidebarEntry {
  key: string
  filePath: string
  changes: FileChange[]
  toolType?: 'Edit' | 'Write'
}

function createSidebarEntries(changes: FileChange[], consolidated: boolean): SidebarEntry[] {
  if (!consolidated) {
    return changes.map(change => ({
      key: change.id,
      filePath: change.filePath,
      changes: [change],
      toolType: change.toolType,
    }))
  }

  const byPath = new Map<string, FileChange[]>()
  for (const change of changes) {
    const existing = byPath.get(change.filePath) || []
    existing.push(change)
    byPath.set(change.filePath, existing)
  }

  return Array.from(byPath.entries()).map(([filePath, fileChanges]) => ({
    key: filePath,
    filePath,
    changes: fileChanges,
  }))
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() || filePath
}

function getParentDir(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length <= 2) return ''
  return parts.slice(-3, -1).join('/')
}

interface SidebarItemProps {
  entry: SidebarEntry
  isSelected: boolean
  onClick: () => void
}

function SidebarItem({ entry, isSelected, onClick }: SidebarItemProps) {
  const fileName = getFileName(entry.filePath)
  const parentDir = getParentDir(entry.filePath)
  const changeCount = entry.changes.length

  return (
    <button
      onClick={onClick}
      title={entry.filePath}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-md transition-colors",
        "text-foreground",
        isSelected
          ? "bg-background shadow-minimal"
          : "hover:bg-foreground/[0.03]"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{fileName}</div>
        {parentDir && (
          <div className="text-[10px] text-foreground/50 truncate">{parentDir}</div>
        )}
      </div>
      {changeCount > 1 && (
        <span className="text-xs text-foreground/50 shrink-0">
          ({changeCount})
        </span>
      )}
    </button>
  )
}

interface SidebarProps {
  entries: SidebarEntry[]
  selectedKey: string | null
  onSelect: (key: string) => void
}

function Sidebar({ entries, selectedKey, onSelect }: SidebarProps) {
  return (
    <div className="space-y-0.5">
      {entries.map(entry => (
        <SidebarItem
          key={entry.key}
          entry={entry}
          isSelected={selectedKey === entry.key}
          onClick={() => onSelect(entry.key)}
        />
      ))}
    </div>
  )
}

// ============================================
// Main FilePreviewApp Component
// ============================================

/**
 * FilePreviewApp - Unified file preview component
 *
 * Supports three modes:
 * - 'view': Read/Write tool results (ShikiCodeViewer)
 * - 'diff': Single Edit tool result (ShikiDiffViewer)
 * - 'multi-diff': Multiple edits/writes with sidebar (ShikiDiffViewer)
 */
export function FilePreviewApp({ sessionId, previewId }: FilePreviewAppProps) {
  const { resolvedMode } = useTheme()
  const [data, setData] = useState<FilePreviewData | null>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Multi-diff specific state
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'snippet' | 'full'>('snippet')
  const [fullFileContent, setFullFileContent] = useState<{ original: string; modified: string } | null>(null)
  const [isLoadingFullFile, setIsLoadingFullFile] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      if (!sessionId || !previewId) {
        setError('Missing session or preview ID')
        return
      }

      if (!window.electronAPI?.getFilePreviewData) {
        setError('API not available')
        return
      }

      try {
        const result = await window.electronAPI.getFilePreviewData(sessionId, previewId)
        if (!result) {
          setError('Preview data not found')
          return
        }
        setData(result)

        // For multi-diff, set initial selection
        if (result.mode === 'multi-diff') {
          const successfulChanges = result.multiDiff.changes.filter(c => !c.error)
          const isConsolidated = result.multiDiff.consolidated !== false

          if (result.multiDiff.focusedChangeId) {
            setSelectedKey(result.multiDiff.focusedChangeId)
          } else if (successfulChanges.length > 0) {
            const key = isConsolidated ? successfulChanges[0].filePath : successfulChanges[0].id
            setSelectedKey(key)
          }
        }
      } catch (err) {
        setError(String(err))
      }
    }

    fetchData()
  }, [sessionId, previewId])

  // Editor ready callback
  const handleEditorReady = useCallback(() => {
    setIsEditorReady(true)
  }, [])

  // Open file in default macOS app
  const handleOpenFile = useCallback((filePath: string) => {
    window.electronAPI?.openFile(filePath)
  }, [])

  // Theme colors
  const isDark = resolvedMode === 'dark'

  // Create sidebar entries for multi-diff mode
  const sidebarEntries = useMemo(() => {
    if (!data || data.mode !== 'multi-diff') return []
    const successfulChanges = data.multiDiff.changes.filter(c => !c.error)
    const isConsolidated = data.multiDiff.consolidated !== false
    return createSidebarEntries(successfulChanges, isConsolidated)
  }, [data])

  // Get selected entry for multi-diff mode
  const selectedEntry = useMemo(() => {
    if (!selectedKey || !data || data.mode !== 'multi-diff') return null
    return sidebarEntries.find(e => e.key === selectedKey) || null
  }, [sidebarEntries, selectedKey, data])

  // Compute combined diff for multi-diff mode
  const combinedDiff = useMemo(() => {
    if (!selectedEntry) return { original: '', modified: '' }

    const changes = selectedEntry.changes
    if (changes.length === 1) {
      return { original: changes[0].original, modified: changes[0].modified }
    }

    const separator = '\n\n// ───────────────────────────────────────\n\n'
    return {
      original: changes.map(c => c.original).join(separator),
      modified: changes.map(c => c.modified).join(separator),
    }
  }, [selectedEntry])

  // Load full file content for multi-diff "full file" view mode
  useEffect(() => {
    if (viewMode !== 'full' || !selectedEntry || !data || data.mode !== 'multi-diff') {
      setFullFileContent(null)
      return
    }

    async function loadFullFile() {
      if (!selectedEntry) return

      setIsLoadingFullFile(true)
      try {
        const currentContent = await window.electronAPI?.readFileForPreview(selectedEntry.filePath)

        if (currentContent === null) {
          setViewMode('snippet')
          return
        }

        let originalContent = currentContent
        const changes = selectedEntry.changes

        for (let i = changes.length - 1; i >= 0; i--) {
          const change = changes[i]
          if (change.toolType === 'Edit') {
            originalContent = originalContent.replace(change.modified, change.original)
          } else {
            originalContent = ''
            break
          }
        }

        setFullFileContent({ original: originalContent, modified: currentContent })
      } catch (err) {
        console.error('Failed to load full file:', err)
        setViewMode('snippet')
      } finally {
        setIsLoadingFullFile(false)
      }
    }

    loadFullFile()
  }, [viewMode, selectedEntry, data])

  // Handle sidebar entry selection
  const handleSelectEntry = useCallback((key: string) => {
    setSelectedKey(key)
    setFullFileContent(null)
    setIsEditorReady(false)
  }, [])

  // Determine if we should show sidebar
  const showSidebar = data?.mode === 'multi-diff' && sidebarEntries.length > 1

  // Fade in when ready
  const isReady = data !== null && (data.mode === 'multi-diff' || isEditorReady)

  // ============================================
  // Render based on mode
  // ============================================

  if (error) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="h-screen w-screen flex flex-col bg-background">
          <WindowHeader />
          <div className="flex-1 flex items-center justify-center text-destructive">
            Error: {error}
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // View mode (Read/Write tools)
  if (data?.mode === 'view') {
    const { view } = data
    const filePath = view.filePath

    return (
      <TooltipProvider delayDuration={0}>
        <div
          className="h-screen w-screen flex flex-col bg-background transition-opacity duration-200"
          style={{ opacity: isReady ? 1 : 0 }}
        >
          <WindowHeader>
            <WindowHeaderBadge
              icon={view.toolType === 'write' ? PenLine : BookOpen}
              label={view.toolType === 'write' ? 'Write' : 'Read'}
              variant={view.toolType === 'write' ? 'write' : 'read'}
            />
            <WindowHeaderBadge
              label={formatFilePath(filePath)}
              onClick={() => handleOpenFile(filePath)}
            />
            {view.startLine !== undefined && view.totalLines !== undefined && (
              <WindowHeaderBadge
                label={`Lines ${view.startLine}–${view.startLine + (view.numLines || 0) - 1} of ${view.totalLines}`}
              />
            )}
          </WindowHeader>

          {view.error && (
            <div className="px-4 py-3 bg-destructive/10 border-b border-destructive/20 flex items-start gap-3">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-destructive/70 mb-0.5">Write Failed</div>
                <p className="text-sm text-destructive whitespace-pre-wrap break-words">{view.error}</p>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 bg-background">
            <ShikiCodeViewer
              code={view.content}
              filePath={filePath}
              language={view.language}
              startLine={view.startLine || 1}
              onReady={handleEditorReady}
            />
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // Diff mode (single Edit)
  if (data?.mode === 'diff') {
    const { diff } = data
    const filePath = diff.filePath

    return (
      <TooltipProvider delayDuration={0}>
        <div
          className="h-screen w-screen flex flex-col bg-background transition-opacity duration-200"
          style={{ opacity: isReady ? 1 : 0 }}
        >
          <WindowHeader>
            <WindowHeaderBadge
              icon={PencilLine}
              label="Edit"
              variant="edit"
            />
            <WindowHeaderBadge
              label={formatFilePath(filePath)}
              onClick={() => handleOpenFile(filePath)}
            />
          </WindowHeader>

          {diff.error && (
            <div className="px-4 py-3 bg-destructive/10 border-b border-destructive/20 flex items-start gap-3">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-destructive/70 mb-0.5">Edit Failed</div>
                <p className="text-sm text-destructive whitespace-pre-wrap break-words">{diff.error}</p>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 bg-background">
            <ShikiDiffViewer
              original={diff.original}
              modified={diff.modified}
              filePath={filePath}
              language={diff.language}
              diffStyle="unified"
              onReady={handleEditorReady}
            />
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // Multi-diff mode (multiple edits/writes)
  if (data?.mode === 'multi-diff') {
    const diffOriginal = viewMode === 'full' && fullFileContent
      ? fullFileContent.original
      : combinedDiff.original
    const diffModified = viewMode === 'full' && fullFileContent
      ? fullFileContent.modified
      : combinedDiff.modified

    return (
      <TooltipProvider delayDuration={0}>
        <div className="h-screen w-screen flex bg-background">
          {/* Sidebar */}
          {showSidebar && (
            <div
              className={cn(
                "w-64 shrink-0 h-full border-r border-foreground/5",
                isDark ? 'bg-foreground/[0.02]' : 'bg-foreground/[0.01]'
              )}
            >
              <div className="mt-[50px] h-[calc(100%-50px)] overflow-y-auto">
                <div className="px-2 pb-2">
                  <div className="px-3 py-1.5 text-xs font-semibold text-foreground/50 uppercase tracking-wide">
                    Changes
                  </div>
                  <Sidebar
                    entries={sidebarEntries}
                    selectedKey={selectedKey}
                    onSelect={handleSelectEntry}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Main area */}
          <div className="flex-1 flex flex-col min-w-0">
            <WindowHeader>
              {selectedEntry && (
                <>
                  {(() => {
                    const hasWrite = selectedEntry.changes.some(c => c.toolType === 'Write')
                    const IconComponent = hasWrite ? FilePlus : PencilLine
                    const label = hasWrite ? 'Write' : 'Edit'
                    const variant = hasWrite ? 'write' : 'edit'
                    return (
                      <WindowHeaderBadge
                        icon={IconComponent}
                        label={selectedEntry.changes.length > 1 ? `${selectedEntry.changes.length} ${label}s` : label}
                        variant={variant}
                      />
                    )
                  })()}
                  <WindowHeaderBadge
                    label={formatFilePath(selectedEntry.filePath)}
                    onClick={() => handleOpenFile(selectedEntry.filePath)}
                  />

                  {/* View mode dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        disabled={isLoadingFullFile}
                        className={cn(
                          "titlebar-no-drag ml-auto flex items-center gap-1 h-[26px] px-2.5 rounded-[6px] font-sans text-[13px] font-medium shadow-minimal cursor-pointer transition-colors",
                          "bg-background text-foreground/70",
                          isLoadingFullFile && "opacity-50 cursor-wait"
                        )}
                      >
                        {viewMode === 'full' ? 'Full File' : 'Snippet'}
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <StyledDropdownMenuContent align="end" sideOffset={4}>
                      <StyledDropdownMenuItem onClick={() => setViewMode('snippet')} className="justify-between">
                        Snippet
                        <Check className={cn("w-3.5 h-3.5", viewMode !== 'snippet' && "opacity-0")} />
                      </StyledDropdownMenuItem>
                      <StyledDropdownMenuItem onClick={() => setViewMode('full')} className="justify-between">
                        Full File
                        <Check className={cn("w-3.5 h-3.5", viewMode !== 'full' && "opacity-0")} />
                      </StyledDropdownMenuItem>
                    </StyledDropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              {!selectedEntry && (
                <span className="text-sm text-foreground/50">
                  {sidebarEntries.length} file{sidebarEntries.length !== 1 ? 's' : ''}
                </span>
              )}
            </WindowHeader>

            {/* Diff viewer */}
            <div className="flex-1 min-h-0">
              {selectedEntry ? (
                <div className="h-full bg-background">
                  <ShikiDiffViewer
                    key={selectedKey}
                    original={diffOriginal}
                    modified={diffModified}
                    filePath={selectedEntry.filePath}
                    diffStyle="unified"
                    onReady={handleEditorReady}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-foreground/50">
                  Select a file to view changes
                </div>
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // Loading state
  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-screen w-screen flex flex-col bg-background opacity-0">
        <WindowHeader />
        <div className="flex-1" />
      </div>
    </TooltipProvider>
  )
}
