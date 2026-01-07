import * as React from 'react'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Save,
  BookOpen,
  PenLine,
  PencilLine,
  FilePlus,
  XCircle,
  ChevronDown,
  Check,
  Terminal,
  Copy,
  Search,
  FolderSearch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import { DropdownMenu, DropdownMenuTrigger, StyledDropdownMenuContent, StyledDropdownMenuItem } from '@/components/ui/styled-dropdown'
import { WindowHeader, WindowHeaderBadge, type BadgeVariant } from '@/components/ui/window-header-badge'
import { formatFilePath } from '@/lib/file-utils'
import { ShikiCodeEditor, ShikiCodeViewer, ShikiDiffViewer } from '@/components/shiki'
import {
  parseAnsi,
  stripAnsi,
  isGrepContentOutput,
  parseGrepOutput,
} from '@craft-agent/ui'
import type { PreviewData, FileChange, MarkdownPreviewData } from '../../../shared/types'

interface UnifiedPreviewAppProps {
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
// Main UnifiedPreviewApp Component
// ============================================

/**
 * UnifiedPreviewApp - Single preview component for all content types
 *
 * Supports five modes:
 * - 'markdown': Markdown content with optional save (ShikiCodeEditor)
 * - 'view': Read/Write tool results (ShikiCodeViewer)
 * - 'diff': Single Edit tool result (ShikiDiffViewer)
 * - 'multi-diff': Multiple edits/writes with sidebar (ShikiDiffViewer)
 * - 'terminal': Bash/Grep/Glob tool output (custom terminal renderer)
 */
export function UnifiedPreviewApp({ sessionId, previewId }: UnifiedPreviewAppProps) {
  const { resolvedMode } = useTheme()
  const [data, setData] = useState<PreviewData | null>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Markdown-specific state
  const [markdownContent, setMarkdownContent] = useState<string | null>(null)
  const [markdownOriginalContent, setMarkdownOriginalContent] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Multi-diff specific state
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'snippet' | 'full'>('snippet')
  const [fullFileContent, setFullFileContent] = useState<{ original: string; modified: string } | null>(null)
  const [isLoadingFullFile, setIsLoadingFullFile] = useState(false)

  // Terminal-specific state
  const [copied, setCopied] = useState<'command' | 'output' | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  // Computed values
  const isMarkdownReadOnly = data?.mode === 'markdown' && data.markdown.mode === 'readOnly'
  const hasUnsavedChanges = data?.mode === 'markdown' && !isMarkdownReadOnly &&
    markdownContent !== null && markdownOriginalContent !== null &&
    markdownContent !== markdownOriginalContent

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      if (!sessionId || !previewId) {
        setError('Missing session or preview ID')
        return
      }

      if (!window.electronAPI?.getPreviewData) {
        setError('API not available')
        return
      }

      try {
        const result = await window.electronAPI.getPreviewData(sessionId, previewId)
        if (!result) {
          setError('Preview data not found')
          return
        }
        setData(result)

        // For markdown, fetch content separately
        if (result.mode === 'markdown') {
          // Content is stored in the main process, fetched via getPreviewData
          // For unified API, we need to also get the markdown content
          const md = result.markdown
          if ('content' in md) {
            setMarkdownContent(md.content)
            setMarkdownOriginalContent(md.content)
          } else {
            // Content was read from file - need to fetch it
            // This is handled by the main process, content comes with the data
            // We'll need to add a separate content field or fetch it
            // For now, let's assume the API returns it
            const contentResult = await window.electronAPI?.readFileForPreview?.(md.filePath)
            if (contentResult) {
              setMarkdownContent(contentResult)
              setMarkdownOriginalContent(contentResult)
            }
          }
        }

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

  // Markdown save handler
  const handleSave = useCallback(async () => {
    if (!hasUnsavedChanges || isSaving || markdownContent === null) return

    setIsSaving(true)
    try {
      await window.electronAPI?.savePreview(sessionId, previewId, markdownContent)
      setMarkdownOriginalContent(markdownContent)
    } catch (err) {
      console.error('[UnifiedPreviewApp] Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }, [sessionId, previewId, markdownContent, hasUnsavedChanges, isSaving])

  // Keyboard shortcut for save (only in markdown readWrite mode)
  useEffect(() => {
    if (data?.mode !== 'markdown' || isMarkdownReadOnly) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, data?.mode, isMarkdownReadOnly])

  // Terminal copy to clipboard
  const copyToClipboard = async (text: string, type: 'command' | 'output') => {
    try {
      await navigator.clipboard.writeText(stripAnsi(text))
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Theme colors
  const isDark = resolvedMode === 'dark'
  const toolbarBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'

  // Terminal theme colors
  const textColor = isDark ? '#e4e4e4' : '#1a1a1a'
  const mutedColor = isDark ? '#888888' : '#666666'
  const cmdColor = isDark ? '#60a5fa' : '#2563eb'
  const codeBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
  const outputBg = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)'

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

  // Terminal ANSI parsing
  const parsedOutput = useMemo(() => {
    if (!data || data.mode !== 'terminal' || !data.terminal.output) return []
    return parseAnsi(data.terminal.output)
  }, [data])

  const isGrepOutput = useMemo(() => {
    if (!data || data.mode !== 'terminal' || !data.terminal.output) return false
    return isGrepContentOutput(data.terminal.output)
  }, [data])

  const grepLines = useMemo(() => {
    if (!isGrepOutput || !data || data.mode !== 'terminal' || !data.terminal.output) return []
    return parseGrepOutput(data.terminal.output)
  }, [isGrepOutput, data])

  // Terminal tool config
  const terminalToolConfig = useMemo((): { icon: typeof Terminal; label: string; variant: BadgeVariant } => {
    if (!data || data.mode !== 'terminal') {
      return { icon: Terminal, label: 'Bash', variant: 'bash' }
    }
    const toolType = data.terminal.toolType || 'bash'
    switch (toolType) {
      case 'grep':
        return { icon: Search, label: 'Grep', variant: 'grep' }
      case 'glob':
        return { icon: FolderSearch, label: 'Glob', variant: 'glob' }
      default:
        return { icon: Terminal, label: 'Bash', variant: 'bash' }
    }
  }, [data])

  // Determine if we should show sidebar
  const showSidebar = data?.mode === 'multi-diff' && sidebarEntries.length > 1

  // Fade in when ready
  const isReady = data !== null && (
    data.mode === 'multi-diff' ||
    data.mode === 'terminal' ||
    isEditorReady
  )

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

  // Markdown mode
  if (data?.mode === 'markdown') {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="h-screen w-screen flex flex-col bg-background">
          {/* Toolbar / Title bar */}
          <div
            className="titlebar-drag-region h-[52px] shrink-0 flex items-center justify-between px-4 bg-background"
            style={{ borderBottom: `1px solid ${toolbarBorder}` }}
          >
            {/* Left side - space for traffic lights on macOS */}
            <div className="w-[70px]" />

            {/* Center - optional title or indicator */}
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-foreground/10 text-foreground/60">
                  Edited
                </span>
              )}
            </div>

            {/* Right side - actions (only show save in readWrite mode) */}
            <div className="flex items-center gap-1 titlebar-no-drag">
              {!isMarkdownReadOnly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSave}
                      disabled={!hasUnsavedChanges || isSaving}
                      className="h-7 w-7 rounded-[4px] hover:bg-foreground/10 disabled:opacity-30"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span>Save</span>
                    <Kbd className="ml-2">⌘S</Kbd>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Editor with fade-in */}
          {markdownContent !== null && (
            <div
              className="flex-1 min-h-0 bg-background transition-opacity duration-200"
              style={{ opacity: isEditorReady ? 1 : 0 }}
            >
              <ShikiCodeEditor
                value={markdownContent}
                language="markdown"
                onChange={(value) => !isMarkdownReadOnly && setMarkdownContent(value)}
                readOnly={isMarkdownReadOnly}
                onReady={handleEditorReady}
              />
            </div>
          )}
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

  // Terminal mode
  if (data?.mode === 'terminal') {
    const terminal = data.terminal

    return (
      <TooltipProvider delayDuration={0}>
        <div
          className="h-screen w-screen flex flex-col bg-background transition-opacity duration-200"
          style={{ color: textColor, opacity: isReady ? 1 : 0 }}
        >
          <WindowHeader>
            <WindowHeaderBadge
              icon={terminalToolConfig.icon}
              label={terminalToolConfig.label}
              variant={terminalToolConfig.variant}
            />
            {terminal.description && (
              <WindowHeaderBadge label={terminal.description} />
            )}
          </WindowHeader>

          {/* Terminal content */}
          <div className="flex-1 overflow-auto p-4 font-mono text-sm" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            {/* Command section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs" style={{ color: mutedColor }}>
                  <Terminal className="w-3 h-3" />
                  <span>Command</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(terminal.command, 'command')}
                      className={`h-6 w-6 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                    >
                      {copied === 'command' ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" style={{ color: mutedColor }} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {copied === 'command' ? 'Copied!' : 'Copy command'}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div
                className="p-3 rounded-lg overflow-x-auto"
                style={{ backgroundColor: codeBg }}
              >
                <code style={{ color: cmdColor }}>{terminal.command}</code>
              </div>
            </div>

            {/* Output section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs" style={{ color: mutedColor }}>
                  <Terminal className="w-3 h-3" />
                  <span>Output</span>
                  {terminal.exitCode !== undefined && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        backgroundColor: terminal.exitCode === 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: terminal.exitCode === 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                      }}
                    >
                      exit {terminal.exitCode}
                    </span>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(terminal.output, 'output')}
                      className={`h-6 w-6 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                    >
                      {copied === 'output' ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" style={{ color: mutedColor }} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {copied === 'output' ? 'Copied!' : 'Copy output'}
                  </TooltipContent>
                </Tooltip>
              </div>
              <pre
                ref={outputRef}
                className="p-3 rounded-lg overflow-auto"
                style={{
                  backgroundColor: outputBg,
                  color: textColor,
                  maxHeight: 'calc(100vh - 200px)',
                }}
              >
                {/* Grep output with line number highlighting */}
                {isGrepOutput && grepLines.length > 0 ? (
                  <div className="space-y-0">
                    {grepLines.map((line, i) => (
                      <div
                        key={i}
                        className="flex"
                        style={{
                          backgroundColor: line.isMatch ? 'rgba(34, 197, 94, 0.08)' : undefined,
                        }}
                      >
                        {/* Line number */}
                        {line.lineNum && (
                          <span
                            className="select-none pr-3 text-right shrink-0"
                            style={{
                              color: line.isMatch ? '#22c55e' : mutedColor,
                              minWidth: '3rem',
                            }}
                          >
                            {line.lineNum}
                            <span style={{ color: line.isMatch ? '#22c55e' : (isDark ? '#444444' : '#cccccc') }}>
                              {line.isMatch ? ':' : '-'}
                            </span>
                          </span>
                        )}
                        {/* Content */}
                        <span
                          className="whitespace-pre-wrap break-words"
                          style={{ color: line.isMatch ? textColor : mutedColor }}
                        >
                          {line.content}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : parsedOutput.length > 0 ? (
                  /* ANSI-colored output */
                  <div className="whitespace-pre-wrap break-words">
                    {parsedOutput.map((span, i) => (
                      <span
                        key={i}
                        style={{
                          color: span.fg,
                          backgroundColor: span.bg,
                          fontWeight: span.bold ? 'bold' : undefined,
                          padding: span.bg ? '0 2px' : undefined,
                          borderRadius: span.bg ? '2px' : undefined,
                        }}
                      >
                        {span.text}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: mutedColor }}>(no output)</span>
                )}
              </pre>
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
