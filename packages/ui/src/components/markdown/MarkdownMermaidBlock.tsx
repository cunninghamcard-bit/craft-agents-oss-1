import * as React from 'react'
import { renderMermaid } from '@craft-agent/mermaid'
import { Maximize2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { CodeBlock } from './CodeBlock'
import { MermaidPreviewOverlay } from '../overlay/MermaidPreviewOverlay'

// ============================================================================
// MarkdownMermaidBlock — renders mermaid code fences as SVG diagrams.
//
// Uses @craft-agent/mermaid to parse flowchart text and produce an SVG string.
// Falls back to a plain code block if rendering fails (invalid syntax, etc).
//
// Theming: Colors are passed as CSS variable references (var(--background),
// var(--foreground), etc.) so the SVG inherits from the app's theme system
// via CSS cascade. Theme switches (light/dark, preset changes) apply
// automatically without re-rendering — the browser resolves the variables.
//
// Wide diagrams: Horizontal diagrams (graph LR) with many nodes can become
// unreadably small when fit to container width. To fix this, we enforce a
// minimum rendered height (MIN_READABLE_HEIGHT). If the natural scale would
// produce a height below this threshold, we scale up and allow horizontal
// scroll. A CSS mask gradient fades the edges to indicate scrollable content.
// ============================================================================

// Minimum rendered height for diagrams. Wide horizontal diagrams are scaled
// up to at least this height to keep text readable, with horizontal scroll.
const MIN_READABLE_HEIGHT = 280

// Fade zone size for scroll indicators (px)
const FADE_SIZE = 32

/** Parse width/height from an SVG string's root element attributes. */
function parseSvgDimensions(svgString: string): { width: number; height: number } | null {
  const widthMatch = svgString.match(/width="(\d+(?:\.\d+)?)"/)
  const heightMatch = svgString.match(/height="(\d+(?:\.\d+)?)"/)
  if (!widthMatch?.[1] || !heightMatch?.[1]) return null
  return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) }
}

interface MarkdownMermaidBlockProps {
  code: string
  className?: string
  /** Whether to show the inline expand button. Default true.
   *  Set to false when the mermaid block is the first block in a message,
   *  where the TurnCard's own fullscreen button already occupies the same position. */
  showExpandButton?: boolean
}

export function MarkdownMermaidBlock({ code, className, showExpandButton = true }: MarkdownMermaidBlockProps) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<Error | null>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  // Scroll state for fade indicators
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    // Pass CSS variable references as colors — the SVG sets inline styles like
    // --bg:var(--background) which the browser resolves via CSS cascade from
    // the app's theme. All mermaid color slots are mapped to app variables:
    //   bg/fg      → base colors
    //   accent     → brand color for arrows and highlights
    //   line       → edge/connector lines (30% fg mix)
    //   muted      → secondary text, edge labels
    //   surface    → node fill tint (3% fg mix)
    //   border     → node/group stroke (20% fg mix)
    renderMermaid(code, {
      bg: 'var(--background)',
      fg: 'var(--foreground)',
      accent: 'var(--accent)',
      line: 'var(--foreground-30)',
      muted: 'var(--muted-foreground)',
      surface: 'var(--foreground-3)',
      border: 'var(--foreground-20)',
      transparent: true,
    })
      .then(result => {
        if (!cancelled) setSvg(result)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })

    return () => { cancelled = true }
  }, [code])

  // Track horizontal scroll state for fade indicators.
  // Updates on scroll events and container resize.
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el || !svg) return

    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el
      setCanScrollLeft(scrollLeft > 1) // 1px threshold to avoid float rounding
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1)
    }

    // Initial check and listeners
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })

    // ResizeObserver catches container width changes (e.g., window resize)
    const resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(el)

    return () => {
      el.removeEventListener('scroll', updateScrollState)
      resizeObserver.disconnect()
    }
  }, [svg])

  // Calculate scaled dimensions for wide diagrams.
  // If the natural height at container width would be below MIN_READABLE_HEIGHT,
  // scale up to reach that height — but never exceed 100% (natural size).
  // This prevents small diagrams from being over-zoomed and pixelated.
  const getScaledDimensions = React.useCallback(() => {
    if (!svg) return null

    const dims = parseSvgDimensions(svg)
    if (!dims) return null

    const containerWidth = scrollRef.current?.clientWidth ?? 600

    // Calculate what height we'd get if we fit to container width
    const fitToContainerScale = containerWidth / dims.width
    const projectedHeight = dims.height * fitToContainerScale

    // If diagram fits well (projected height ≥ threshold), show centered
    if (projectedHeight >= MIN_READABLE_HEIGHT) {
      return { scale: 1, width: undefined, height: undefined, needsScroll: false }
    }

    // Diagram would be too small at container width.
    // Scale up to reach MIN_READABLE_HEIGHT, but cap at 100% (natural size).
    const desiredScale = MIN_READABLE_HEIGHT / dims.height
    const scale = Math.min(desiredScale, 1.0)

    const scaledWidth = dims.width * scale
    const scaledHeight = dims.height * scale

    // Enable scroll if scaled content is wider than container
    return {
      scale,
      width: scaledWidth,
      height: scaledHeight,
      needsScroll: scaledWidth > containerWidth,
    }
  }, [svg])

  // Build CSS mask gradient based on scroll state
  const getMaskImage = React.useCallback(() => {
    if (canScrollLeft && canScrollRight) {
      return `linear-gradient(to right, transparent, black ${FADE_SIZE}px, black calc(100% - ${FADE_SIZE}px), transparent)`
    }
    if (canScrollRight) {
      return `linear-gradient(to right, black calc(100% - ${FADE_SIZE}px), transparent)`
    }
    if (canScrollLeft) {
      return `linear-gradient(to right, transparent, black ${FADE_SIZE}px)`
    }
    return undefined
  }, [canScrollLeft, canScrollRight])

  // On error, fall back to a plain code block showing the mermaid source
  if (error) {
    return <CodeBlock code={code} language="mermaid" mode="full" className={className} />
  }

  // Loading state: show the code block until SVG is ready
  if (!svg) {
    return <CodeBlock code={code} language="mermaid" mode="full" className={className} />
  }

  const scaledDims = getScaledDimensions()
  const maskImage = getMaskImage()

  return (
    <>
      {/* Wrapper with group class so the expand button shows on hover */}
      <div className={cn('relative group', className)}>
        {/* Expand button — matches code block expand button style (TurnCard pattern).
            Hidden when showExpandButton is false (first block in message, where
            TurnCard's own fullscreen button occupies the same top-right position). */}
        {showExpandButton && (
          <button
            onClick={() => setIsFullscreen(true)}
            className={cn(
              "absolute top-2 right-2 p-1 rounded-[6px] transition-all z-10 select-none",
              "opacity-0 group-hover:opacity-100",
              "bg-background shadow-minimal",
              "text-muted-foreground/50 hover:text-foreground",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:opacity-100"
            )}
            title="View Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Scroll container with fade mask for overflow indication.
            CSS mask gradient fades the edges when content is scrollable. */}
        <div
          ref={scrollRef}
          style={{
            overflowX: 'auto',
            overflowY: 'hidden',
            maskImage,
            WebkitMaskImage: maskImage,
          }}
        >
          {/* Size wrapper — when scaling is needed, this div has explicit dimensions
              matching the scaled size so the scroll container knows the content size. */}
          <div
            style={{
              width: scaledDims?.needsScroll ? `${scaledDims.width}px` : undefined,
              height: scaledDims?.needsScroll ? `${scaledDims.height}px` : undefined,
              display: scaledDims?.needsScroll ? 'block' : 'flex',
              justifyContent: scaledDims?.needsScroll ? undefined : 'center',
            }}
          >
            {/* SVG container — CSS transform scales the SVG visually.
                transform-origin: top left ensures scaling expands down and right. */}
            <div
              dangerouslySetInnerHTML={{ __html: svg }}
              style={{
                transformOrigin: 'top left',
                transform: scaledDims?.needsScroll ? `scale(${scaledDims.scale})` : undefined,
              }}
            />
          </div>
        </div>
      </div>

      {/* Fullscreen overlay with zoom/pan */}
      <MermaidPreviewOverlay
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        svg={svg}
        code={code}
      />
    </>
  )
}
