import * as React from 'react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Terminal, Copy, Check, Search, FolderSearch } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/context/ThemeContext'
import { WindowHeader, WindowHeaderBadge, type BadgeVariant } from '@/components/ui/window-header-badge'
import {
  parseAnsi,
  stripAnsi,
  isGrepContentOutput,
  parseGrepOutput,
} from '@craft-agent/ui'
import type { TerminalPreviewData } from '../../../shared/types'

interface TerminalPreviewAppProps {
  sessionId: string
  previewId: string
}

/**
 * TerminalPreviewApp - Terminal-style view for Bash command and output
 *
 * This is the Electron window wrapper that fetches terminal data and displays it.
 * Uses ANSI parsing utilities from @craft-agent/ui.
 */
export function TerminalPreviewApp({ sessionId, previewId }: TerminalPreviewAppProps) {
  const [data, setData] = useState<TerminalPreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'command' | 'output' | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  // Fetch terminal data on mount
  useEffect(() => {
    async function fetchData() {
      if (!sessionId || !previewId) {
        setError('Missing session or preview ID')
        return
      }

      if (!window.electronAPI?.getTerminalPreviewData) {
        setError('API not available')
        return
      }

      try {
        const result = await window.electronAPI.getTerminalPreviewData(sessionId, previewId)
        if (!result) {
          setError('Terminal data not found')
          return
        }
        setData(result)
      } catch (err) {
        setError(String(err))
      }
    }

    fetchData()
  }, [sessionId, previewId])

  // Copy to clipboard (strip ANSI codes for clean text)
  const copyToClipboard = async (text: string, type: 'command' | 'output') => {
    try {
      await navigator.clipboard.writeText(stripAnsi(text))
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Memoize ANSI-parsed output for performance
  const parsedOutput = useMemo(() => {
    if (!data?.output) return []
    return parseAnsi(data.output)
  }, [data?.output])

  // Check if this looks like grep content output
  const isGrepOutput = useMemo(() => {
    if (!data?.output) return false
    return isGrepContentOutput(data.output)
  }, [data?.output])

  // Parse grep output if applicable
  const grepLines = useMemo(() => {
    if (!isGrepOutput || !data?.output) return []
    return parseGrepOutput(data.output)
  }, [isGrepOutput, data?.output])

  const { resolvedMode } = useTheme()
  const isDark = resolvedMode === 'dark'

  // Theme-aware colors
  const textColor = isDark ? '#e4e4e4' : '#1a1a1a'
  const mutedColor = isDark ? '#888888' : '#666666'
  const cmdColor = isDark ? '#60a5fa' : '#2563eb' // Blue for command
  const codeBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
  const outputBg = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)'

  // Tool type config
  const toolConfig = useMemo((): { icon: typeof Terminal; label: string; variant: BadgeVariant } => {
    const toolType = data?.toolType || 'bash'
    switch (toolType) {
      case 'grep':
        return { icon: Search, label: 'Grep', variant: 'grep' }
      case 'glob':
        return { icon: FolderSearch, label: 'Glob', variant: 'glob' }
      default:
        return { icon: Terminal, label: 'Bash', variant: 'bash' }
    }
  }, [data?.toolType])

  // Fade in entire window when data loads
  const isReady = data !== null

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className="h-screen w-screen flex flex-col bg-background transition-opacity duration-200"
        style={{ color: textColor, opacity: isReady ? 1 : 0 }}
      >
        <WindowHeader>
          <WindowHeaderBadge
            icon={toolConfig.icon}
            label={toolConfig.label}
            variant={toolConfig.variant}
          />
          {data?.description && (
            <WindowHeaderBadge
              label={data.description}
            />
          )}
        </WindowHeader>

        {/* Error overlay */}
        {error && (
          <div className="flex-1 flex items-center justify-center text-destructive">
            Error: {error}
          </div>
        )}

        {/* Terminal content */}
        {data && !error && (
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
                      onClick={() => copyToClipboard(data.command, 'command')}
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
                <code style={{ color: cmdColor }}>{data.command}</code>
              </div>
            </div>

            {/* Output section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs" style={{ color: mutedColor }}>
                  <Terminal className="w-3 h-3" />
                  <span>Output</span>
                  {data.exitCode !== undefined && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        backgroundColor: data.exitCode === 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: data.exitCode === 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                      }}
                    >
                      exit {data.exitCode}
                    </span>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(data.output, 'output')}
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
                          // Add padding for background colors
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
        )}
      </div>
    </TooltipProvider>
  )
}
