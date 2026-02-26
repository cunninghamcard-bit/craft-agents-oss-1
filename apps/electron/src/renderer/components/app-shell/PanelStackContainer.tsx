/**
 * PanelStackContainer
 *
 * Horizontal layout container for ALL panels:
 * Sidebar → Navigator → Content Panel(s) with resize sashes.
 *
 * Content panels use CSS flex-grow with their proportions as weights:
 * - Each panel gets `flex: <proportion> 1 0px` with `min-width: PANEL_MIN_WIDTH`
 * - Flex distributes available space proportionally — panels fill the viewport
 * - When panels hit min-width, overflow-x: auto kicks in naturally
 *
 * Sidebar and Navigator are NOT part of the proportional layout —
 * they have their own fixed/user-resizable widths managed by AppShell.
 * They just reduce the available width for content panels and scroll with everything else.
 *
 * The right sidebar stays OUTSIDE this container.
 */

import { useRef, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { panelStackAtom, focusedPanelIdAtom, focusedPanelIndexAtom } from '@/atoms/panel-stack'
import { PanelSlot } from './PanelSlot'
import { PanelResizeSash } from './PanelResizeSash'

/** Spring transition matching AppShell's sidebar/navigator animation */
const PANEL_SPRING = { type: 'spring' as const, stiffness: 600, damping: 49 }

/** Gap between adjacent panels */
const PANEL_GAP = 6

interface PanelStackContainerProps {
  sidebarSlot: React.ReactNode
  sidebarWidth: number
  navigatorSlot: React.ReactNode
  navigatorWidth: number
  isFocusedMode: boolean
  isRightSidebarVisible?: boolean
  isResizing?: boolean
}

export function PanelStackContainer({
  sidebarSlot,
  sidebarWidth,
  navigatorSlot,
  navigatorWidth,
  isFocusedMode,
  isRightSidebarVisible,
  isResizing,
}: PanelStackContainerProps) {
  const panelStack = useAtomValue(panelStackAtom)
  const focusedPanelId = useAtomValue(focusedPanelIdAtom)
  const focusedIndex = useAtomValue(focusedPanelIndexAtom)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(panelStack.length)

  const hasSidebar = sidebarWidth > 0
  const hasNavigator = navigatorWidth > 0
  const isMultiPanel = panelStack.length > 1

  // Auto-scroll to newly pushed content panel
  useEffect(() => {
    if (panelStack.length > prevCountRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          left: scrollRef.current.scrollWidth,
          behavior: 'smooth',
        })
      })
    }
    prevCountRef.current = panelStack.length
  }, [panelStack.length])

  const transition = isResizing ? { duration: 0 } : PANEL_SPRING

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-w-0 flex relative z-panel panel-scroll"
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        // Extra vertical space for box-shadows (collapsed back with negative margin)
        paddingBlock: 8,
        marginBlock: -8,
        // Extend to window bottom so scrollbar sits at the very edge
        marginBottom: -6,
        paddingBottom: 6,
      }}
    >
      {/* Inner flex container — flex-grow: 1 fills viewport, content can overflow for scroll.
           Right padding gives room for the last panel's box-shadow. */}
      <div
        className="flex h-full"
        style={{ gap: PANEL_GAP, flexGrow: 1, minWidth: 0 }}
      >
        {/* === SIDEBAR SLOT === */}
        <motion.div
          initial={false}
          animate={{
            width: hasSidebar ? sidebarWidth : 0,
            opacity: hasSidebar ? 1 : 0,
          }}
          transition={transition}
          className="h-full overflow-hidden relative shrink-0"
        >
          <div className="h-full" style={{ width: sidebarWidth }}>
            {sidebarSlot}
          </div>
        </motion.div>

        {/* === NAVIGATOR SLOT === */}
        <motion.div
          initial={false}
          animate={{
            width: hasNavigator ? navigatorWidth : 0,
            opacity: hasNavigator ? 1 : 0,
          }}
          transition={transition}
          className={cn(
            'h-full overflow-hidden relative shrink-0',
            'bg-background shadow-middle',
            isMultiPanel ? 'rounded-[10px]' : 'rounded-l-[14px] rounded-r-[10px]',
          )}
        >
          <div className="h-full" style={{ width: navigatorWidth }}>
            {navigatorSlot}
          </div>
        </motion.div>

        {/* === CONTENT PANELS WITH SASHES === */}
        {panelStack.map((entry, index) => (
          <PanelSlot
            key={entry.id}
            entry={entry}
            isPrimary={index === 0}
            isOnly={panelStack.length === 1}
            isLast={index === panelStack.length - 1}
            isFocusedPanel={isMultiPanel ? index === focusedIndex : true}
            isFocusedMode={isFocusedMode}
            isRightSidebarVisible={isRightSidebarVisible}
            proportion={entry.proportion}
            sash={index > 0 ? (
              <PanelResizeSash
                leftIndex={index - 1}
                rightIndex={index}
              />
            ) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
