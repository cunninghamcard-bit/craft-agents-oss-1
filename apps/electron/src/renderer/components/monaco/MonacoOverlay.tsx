/**
 * MonacoOverlay - Fullscreen Monaco editor overlay for viewing code/responses
 *
 * Features:
 * - Full-viewport overlay via ReactDOM.createPortal
 * - Read-only Monaco editor with syntax highlighting
 * - Light/dark theme sync
 * - Escape key to close
 * - Copy button
 * - Auto-language detection from content
 */

import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import * as ReactDOM from 'react-dom'
import Editor, { DiffEditor } from '@monaco-editor/react'
import { X, Copy, Check } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

export interface MonacoOverlayProps {
  /** Content to display in the editor (used when not in diff mode) */
  content: string
  /** Language for syntax highlighting (auto-detected if not provided) */
  language?: string
  /** Whether the overlay is visible */
  isOpen: boolean
  /** Callback when the overlay should close */
  onClose: () => void
  /** Optional title to display in the header */
  title?: string
  /** Enable diff mode for side-by-side comparison */
  diffMode?: boolean
  /** Original content (left side) for diff mode */
  originalContent?: string
  /** Modified content (right side) for diff mode */
  modifiedContent?: string
}

/**
 * Auto-detect language from content.
 * Looks for common patterns to determine the most likely language.
 */
function detectLanguage(content: string): string {
  // Check for code block markers at the start
  const codeBlockMatch = content.match(/^```(\w+)/)
  if (codeBlockMatch) {
    return codeBlockMatch[1]
  }

  // TypeScript/JavaScript patterns
  if (
    /import\s+{/.test(content) ||
    /export\s+(default\s+)?function/.test(content) ||
    /const\s+\w+\s*=\s*\(/.test(content) ||
    /interface\s+\w+/.test(content) ||
    /type\s+\w+\s*=/.test(content)
  ) {
    return 'typescript'
  }

  // JSON
  if (/^\s*{[\s\S]*}$/.test(content.trim()) || /^\s*\[[\s\S]*\]$/.test(content.trim())) {
    try {
      JSON.parse(content)
      return 'json'
    } catch {
      // Not valid JSON, continue
    }
  }

  // Python
  if (/^(def|class|import|from)\s+/.test(content) || /:\s*$/.test(content.split('\n')[0])) {
    return 'python'
  }

  // Bash/Shell
  if (/^#!/.test(content) || /^\s*(cd|ls|mkdir|rm|echo|export)\s+/.test(content)) {
    return 'bash'
  }

  // HTML
  if (/<(!DOCTYPE|html|head|body|div|span|p|a)\b/i.test(content)) {
    return 'html'
  }

  // CSS
  if (/^[\w.#][\w\s.#,-]*{[\s\S]*}/.test(content)) {
    return 'css'
  }

  // Default to markdown for general text content
  return 'markdown'
}

export function MonacoOverlay({
  content,
  language,
  isOpen,
  onClose,
  title = 'Preview',
  diffMode = false,
  originalContent = '',
  modifiedContent = '',
}: MonacoOverlayProps) {
  const { resolvedMode } = useTheme()
  const [copied, setCopied] = useState(false)

  // Auto-detect language if not provided
  const detectedLanguage = language || detectLanguage(diffMode ? modifiedContent : content)

  // Handle copy - in diff mode, copy the modified content
  const handleCopy = useCallback(async () => {
    try {
      const textToCopy = diffMode ? modifiedContent : content
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [content, diffMode, modifiedContent])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Don't render if not open
  if (!isOpen) return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-border [-webkit-app-region:drag]">
        <div className="flex items-center gap-3 [-webkit-app-region:no-drag]">
          {/* Close button */}
          <button
            onClick={onClose}
            className={cn(
              "p-1 rounded-[6px] transition-colors",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-foreground/5",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Title */}
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {detectedLanguage}
          </span>
        </div>

        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-xs transition-colors",
              copied
                ? "text-success"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Monaco Editor or DiffEditor */}
      <div className="flex-1 min-h-0">
        {diffMode ? (
          <DiffEditor
            height="100%"
            language={detectedLanguage}
            theme={resolvedMode === 'dark' ? 'vs-dark' : 'vs'}
            original={originalContent}
            modified={modifiedContent}
            options={{
              // Read-only mode
              readOnly: true,
              originalEditable: false,

              // Font settings
              fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              fontSize: 14,
              lineHeight: 1.6,

              // Layout
              renderSideBySide: true,
              minimap: { enabled: false },
              lineNumbers: 'on',
              glyphMargin: false,
              folding: true,
              lineDecorationsWidth: 8,
              lineNumbersMinChars: 3,

              // Behavior
              scrollBeyondLastLine: false,
              automaticLayout: true,

              // Appearance
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },

              // Padding
              padding: {
                top: 16,
                bottom: 16,
              },
            }}
          />
        ) : (
          <Editor
            height="100%"
            language={detectedLanguage}
            theme={resolvedMode === 'dark' ? 'vs-dark' : 'vs'}
            value={content}
            options={{
              // Read-only mode
              readOnly: true,
              domReadOnly: true,

              // Font settings
              fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              fontSize: 14,
              lineHeight: 1.6,

              // Layout
              wordWrap: 'on',
              minimap: { enabled: false },
              lineNumbers: 'on',
              glyphMargin: false,
              folding: true,
              lineDecorationsWidth: 8,
              lineNumbersMinChars: 3,

              // Behavior
              scrollBeyondLastLine: false,
              automaticLayout: true,

              // Appearance
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },

              // Padding
              padding: {
                top: 16,
                bottom: 16,
              },
            }}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
