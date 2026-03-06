import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '../../lib/utils'

export type AnchorX = 'left' | 'center' | 'right'
export type AnchorY = 'top' | 'center' | 'bottom'

export interface IslandContentViewProps {
  id: string
  anchorX?: AnchorX
  anchorY?: AnchorY
  className?: string
  children: React.ReactNode
}

/**
 * Marker component for Island child views.
 *
 * Usage:
 * <Island activeViewId="compact">
 *   <IslandContentView id="compact">...</IslandContentView>
 *   <IslandContentView id="confirm">...</IslandContentView>
 * </Island>
 */
export function IslandContentView({ children }: IslandContentViewProps) {
  return <>{children}</>
}
IslandContentView.displayName = 'IslandContentView'

export interface IslandTransitionConfig {
  /** Master duration used by both shell and content animations */
  duration?: number
  /** Spring bounce for the shell layout animation */
  bounce?: number
  /** Enter/exit blur radius in px for content crossfade */
  blurPx?: number
}

export interface IslandActiveViewSize {
  id: string
  width: number
  height: number
}

export interface IslandProps {
  activeViewId: string
  children: React.ReactNode
  className?: string
  radius?: number
  transitionConfig?: IslandTransitionConfig
  onActiveViewSizeChange?: (size: IslandActiveViewSize) => void
}

const DEFAULT_TRANSITION: Required<IslandTransitionConfig> = {
  duration: 0.4,
  bounce: 0.2,
  blurPx: 7,
}

const IslandAnimationContext = React.createContext<Required<IslandTransitionConfig>>(DEFAULT_TRANSITION)

export function useIslandAnimationConfig(): Required<IslandTransitionConfig> {
  return React.useContext(IslandAnimationContext)
}

const CONTENT_EASE = [0.2, 0.8, 0.2, 1] as const

function resolveAlignClass(anchorX: AnchorX = 'center', anchorY: AnchorY = 'top'): string {
  const x = anchorX === 'left' ? 'justify-start' : anchorX === 'right' ? 'justify-end' : 'justify-center'
  const y = anchorY === 'top' ? 'items-start' : anchorY === 'bottom' ? 'items-end' : 'items-center'
  return `${x} ${y}`
}

/**
 * Animated shell that morphs between registered IslandContentView children.
 *
 * - Outer shell: layout spring
 * - Inner content: parallel enter/exit crossfade + blur
 */
export function Island({
  activeViewId,
  children,
  className,
  radius = 12,
  transitionConfig,
  onActiveViewSizeChange,
}: IslandProps) {
  const activeViewRef = React.useRef<HTMLDivElement | null>(null)
  const lastSizeRef = React.useRef<{ id: string; width: number; height: number } | null>(null)
  const [isTransitionSettling, setIsTransitionSettling] = React.useState(true)
  const cfg = React.useMemo(
    () => ({ ...DEFAULT_TRANSITION, ...(transitionConfig ?? {}) }),
    [transitionConfig]
  )

  const layoutTransition = React.useMemo(
    () => ({ type: 'spring' as const, duration: cfg.duration, bounce: cfg.bounce }),
    [cfg.duration, cfg.bounce]
  )

  const contentTransition = React.useMemo(
    () => ({ duration: cfg.duration, ease: CONTENT_EASE }),
    [cfg.duration]
  )

  type ResolvedView = {
    id: string
    anchorX?: AnchorX
    anchorY?: AnchorY
    className?: string
    node: React.ReactNode
  }

  const contentViews = React.useMemo(() => {
    const entries: ResolvedView[] = []

    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return

      // Primary path: explicit IslandContentView marker component
      if (child.type === IslandContentView) {
        const props = child.props as IslandContentViewProps
        entries.push({
          id: props.id,
          anchorX: props.anchorX,
          anchorY: props.anchorY,
          className: props.className,
          node: props.children,
        })
        return
      }

      // Flexible path: wrapped view components pass id/anchor props and render their own content.
      const props = child.props as Partial<IslandContentViewProps>
      if (typeof props.id === 'string') {
        entries.push({
          id: props.id,
          anchorX: props.anchorX,
          anchorY: props.anchorY,
          className: props.className,
          node: child,
        })
      }
    })

    return entries
  }, [children])

  const activeView = React.useMemo(
    () => contentViews.find((v) => v.id === activeViewId) ?? contentViews[0],
    [contentViews, activeViewId]
  )

  React.useEffect(() => {
    if (!activeView) return
    setIsTransitionSettling(true)
  }, [activeView?.id])

  React.useEffect(() => {
    if (!isTransitionSettling) return

    if (typeof window === 'undefined') {
      setIsTransitionSettling(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setIsTransitionSettling(false)
    }, Math.max(0, cfg.duration * 1000 + 80))

    return () => {
      window.clearTimeout(timeout)
    }
  }, [isTransitionSettling, cfg.duration])

  React.useEffect(() => {
    if (!activeView || !onActiveViewSizeChange) return

    const element = activeViewRef.current
    if (!element) return

    const emitIfChanged = () => {
      if (isTransitionSettling) return

      const rect = element.getBoundingClientRect()
      const next = {
        id: activeView.id,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }

      if (next.width <= 0 || next.height <= 0) return

      const prev = lastSizeRef.current
      if (prev && prev.id === next.id && prev.width === next.width && prev.height === next.height) return

      lastSizeRef.current = next
      onActiveViewSizeChange(next)
    }

    emitIfChanged()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      emitIfChanged()
    })

    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [activeView, onActiveViewSizeChange, isTransitionSettling])

  if (!activeView) return null

  return (
    <IslandAnimationContext.Provider value={cfg}>
      <motion.div
        layout
        transition={layoutTransition}
        style={{ borderRadius: radius }}
        className={cn('mx-auto w-fit overflow-hidden border border-border/50 bg-background shadow-strong', className)}
      >
        <div className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={activeView.id}
              layout
              initial={{ opacity: 0, filter: `blur(${cfg.blurPx}px)` }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: `blur(${cfg.blurPx}px)` }}
              transition={contentTransition}
              onAnimationComplete={() => setIsTransitionSettling(false)}
              onLayoutAnimationComplete={() => setIsTransitionSettling(false)}
            >
              <div
                ref={activeViewRef}
                className={cn('flex', resolveAlignClass(activeView.anchorX, activeView.anchorY), activeView.className)}
              >
                {activeView.node}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </IslandAnimationContext.Provider>
  )
}
