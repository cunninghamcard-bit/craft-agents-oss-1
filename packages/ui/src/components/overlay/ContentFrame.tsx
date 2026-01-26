/**
 * ContentFrame - Shared terminal-style card frame for all preview overlays
 *
 * Provides the "app window" look: rounded card with fake traffic lights title bar,
 * centered on a bg-foreground-3 background. Supports optional left and right sidebars
 * rendered outside the card (e.g., file navigation in MultiDiffPreviewOverlay).
 *
 * Layout:
 *   absolute inset-0, flex centered, p-6
 *     └── flex row (gap-4, max-w constrained, max-h-[80vh])
 *          ├── leftSidebar?  (shrink-0, overflow-y-auto)
 *          ├── Card (flex-1, rounded-2xl, bg-background, shadow-strong)
 *          │    ├── Title bar (traffic lights + title label)
 *          │    └── children (flex-1, min-h-0)
 *          └── rightSidebar? (shrink-0, overflow-y-auto)
 *
 * Used by: TerminalPreviewOverlay, CodePreviewOverlay, GenericOverlay,
 *          JSONPreviewOverlay, MultiDiffPreviewOverlay
 */

import type { ReactNode } from 'react'

export interface ContentFrameProps {
  /** Title bar label displayed between the traffic lights and the right spacer */
  title: string
  /** Max width of the entire layout row — card + sidebars (default: 850) */
  maxWidth?: number
  /** Optional content rendered to the left of the card (e.g., sidebar navigation) */
  leftSidebar?: ReactNode
  /** Optional content rendered to the right of the card */
  rightSidebar?: ReactNode
  /** Content rendered inside the card, below the title bar */
  children: ReactNode
}

export function ContentFrame({
  title,
  maxWidth = 850,
  leftSidebar,
  rightSidebar,
  children,
}: ContentFrameProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 overflow-auto">
      {/* Row container — holds optional sidebars + the main card.
          max-w applies to the entire row so sidebars are included in the constraint. */}
      <div
        className="flex gap-4 w-full h-full"
        style={{ maxWidth, maxHeight: '80vh' }}
      >
        {/* Left sidebar — rendered outside the card, directly on the bg-foreground-3 background */}
        {leftSidebar && (
          <div className="shrink-0 h-full overflow-y-auto">
            {leftSidebar}
          </div>
        )}

        {/* Main card — the "app window" with title bar and content */}
        <div className="flex-1 min-w-0 flex flex-col rounded-2xl overflow-hidden backdrop-blur-sm shadow-strong bg-background">
          {/* Title bar with decorative traffic lights */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-foreground/12 select-none shrink-0">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full border border-foreground/15" />
              <div className="w-3 h-3 rounded-full border border-foreground/15" />
              <div className="w-3 h-3 rounded-full border border-foreground/15" />
            </div>
            <div className="text-xs font-semibold tracking-wider text-foreground/30">
              {title}
            </div>
            <div className="w-12" />
          </div>

          {/* Content area — children handle their own scrolling/layout */}
          <div className="flex-1 min-h-0">
            {children}
          </div>
        </div>

        {/* Right sidebar — rendered outside the card, directly on the bg-foreground-3 background */}
        {rightSidebar && (
          <div className="shrink-0 h-full overflow-y-auto">
            {rightSidebar}
          </div>
        )}
      </div>
    </div>
  )
}
