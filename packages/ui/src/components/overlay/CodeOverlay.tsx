/**
 * CodeOverlay - Fullscreen overlay for viewing code/activity content
 *
 * A lightweight alternative to Monaco for the web viewer.
 * Uses Shiki-based CodeBlock for syntax highlighting.
 *
 * Features:
 * - Full-viewport overlay via ReactDOM.createPortal
 * - Syntax highlighted code with Shiki
 * - Light/dark theme detection
 * - Escape key to close
 * - Copy button
 * - Optional diff mode (side-by-side text comparison)
 */

import * as React from 'react'
import { useCallback, useEffect, useState, useMemo } from 'react'
import * as ReactDOM from 'react-dom'
import { cn } from '../../lib/utils'
import { CodeBlock } from '../markdown/CodeBlock'

export interface CodeOverlayProps {
  /** Content to display (used when not in diff mode) */
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
 * Auto-detect language from content patterns.
 */
function detectLanguage(content: string): string {
  // Check for code block markers at the start
  const codeBlockMatch = content.match(/^```(\w+)/)
  if (codeBlockMatch && codeBlockMatch[1]) {
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
  const firstLine = content.split('\n')[0] ?? ''
  if (/^(def|class|import|from)\s+/.test(content) || /:\s*$/.test(firstLine)) {
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

/**
 * Detect language from file path extension.
 */
function detectLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    php: 'php',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    sql: 'sql',
    graphql: 'graphql',
    gql: 'graphql',
    toml: 'toml',
    ini: 'ini',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  }
  return langMap[ext || ''] || 'text'
}

export function CodeOverlay({
  content,
  language,
  isOpen,
  onClose,
  title = 'Preview',
  diffMode = false,
  originalContent = '',
  modifiedContent = '',
}: CodeOverlayProps) {
  const [copied, setCopied] = useState(false)

  // Auto-detect language if not provided
  const detectedLanguage = useMemo(() => {
    if (language) return language
    // Try to detect from title (file path)
    if (title.includes('/') || title.includes('.')) {
      const pathLang = detectLanguageFromPath(title)
      if (pathLang !== 'text') return pathLang
    }
    return detectLanguage(diffMode ? modifiedContent : content)
  }, [language, title, diffMode, modifiedContent, content])

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
      <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-3">
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
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Title */}
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
            {detectedLanguage}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {diffMode ? (
          // Side-by-side diff view
          <div className="flex gap-4 h-full">
            <div className="flex-1 flex flex-col min-w-0">
              <div className="text-xs text-muted-foreground mb-2 font-medium">Original</div>
              <div className="flex-1 overflow-auto rounded-lg border bg-muted/20 p-4">
                <CodeBlock code={originalContent} language={detectedLanguage} mode="minimal" />
              </div>
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              <div className="text-xs text-muted-foreground mb-2 font-medium">Modified</div>
              <div className="flex-1 overflow-auto rounded-lg border bg-muted/20 p-4">
                <CodeBlock code={modifiedContent} language={detectedLanguage} mode="minimal" />
              </div>
            </div>
          </div>
        ) : (
          // Single content view
          <div className="h-full overflow-auto rounded-lg border bg-muted/20 p-4">
            <CodeBlock code={content} language={detectedLanguage} mode="minimal" />
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export { detectLanguageFromPath }
