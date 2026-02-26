/**
 * PanelSlot
 *
 * Renders a single content panel within the PanelStackContainer.
 *
 * When a panel is the only one (isOnly), it flex-grows to fill available space.
 * When multiple panels exist, each uses flex-grow with its proportion as the weight,
 * combined with min-width to prevent shrinking below PANEL_MIN_WIDTH.
 *
 * Each PanelSlot overrides AppShellContext to inject a per-panel close button
 * into PanelHeader's rightSidebarButton slot:
 * - Primary panel: close = navigate to parent route (clears selection in navigator)
 * - Secondary panels: close = remove panel from stack
 */

import { useCallback, useMemo } from 'react'
import { useSetAtom } from 'jotai'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { parseRouteToNavigationState } from '../../../shared/route-parser'
import { routes } from '../../../shared/routes'
import {
  isSessionsNavigation,
  isSourcesNavigation,
  isSettingsNavigation,
  isSkillsNavigation,
} from '../../../shared/types'
import type { NavigationState } from '../../../shared/types'
import { closePanelAtom, focusedPanelIdAtom, type PanelStackEntry } from '@/atoms/panel-stack'
import { useNavigation } from '@/contexts/NavigationContext'
import { useAppShellContext, AppShellProvider } from '@/context/AppShellContext'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { MainContentPanel } from './MainContentPanel'
import { PANEL_MIN_WIDTH } from './PanelResizeSash'

interface PanelSlotProps {
  entry: PanelStackEntry
  isPrimary: boolean
  isOnly: boolean
  isLast: boolean
  /** Whether this panel is the focused panel in a multi-panel layout */
  isFocusedPanel: boolean
  isFocusedMode: boolean
  isRightSidebarVisible?: boolean
  /** Flex-grow weight for proportional sizing */
  proportion: number
  /** Optional sash element rendered before this panel */
  sash?: React.ReactNode
}

/**
 * Get the list route (without details) for the primary panel close action.
 */
function getParentRoute(navState: NavigationState | null): string | null {
  if (!navState) return null

  if (isSessionsNavigation(navState) && navState.details) {
    switch (navState.filter.kind) {
      case 'allSessions': return routes.view.allSessions()
      case 'flagged': return routes.view.flagged()
      case 'archived': return routes.view.archived()
      case 'state': return routes.view.state(navState.filter.stateId)
      case 'label': return routes.view.label(navState.filter.labelId)
      case 'view': return routes.view.view(navState.filter.viewId)
    }
  }

  if (isSourcesNavigation(navState) && navState.details) {
    return routes.view.sources(navState.filter ? { type: navState.filter.sourceType } : undefined)
  }

  if (isSkillsNavigation(navState) && navState.details) {
    return routes.view.skills()
  }

  return null
}

export function PanelSlot({
  entry,
  isPrimary,
  isOnly,
  isLast,
  isFocusedPanel,
  isFocusedMode,
  isRightSidebarVisible,
  proportion,
  sash,
}: PanelSlotProps) {
  const closePanel = useSetAtom(closePanelAtom)
  const setFocusedPanel = useSetAtom(focusedPanelIdAtom)
  const { navigate } = useNavigation()
  const parentContext = useAppShellContext()
  const navState = parseRouteToNavigationState(entry.route)
  const parentRoute = isPrimary ? getParentRoute(navState) : null

  const handleClose = useCallback(() => {
    if (isPrimary && parentRoute) {
      navigate(parentRoute as any)
    } else {
      closePanel(entry.id)
    }
  }, [isPrimary, parentRoute, navigate, closePanel, entry.id])

  // Build close button for PanelHeader (via context override)
  const showCloseButton = isPrimary ? !!parentRoute : true
  const closeButton = useMemo(() => {
    if (!showCloseButton) return null
    return (
      <HeaderIconButton
        icon={<X className="h-4 w-4" />}
        onClick={handleClose}
        tooltip="Close"
        className="text-foreground"
      />
    )
  }, [showCloseButton, handleClose])

  // Override AppShellContext so ChatPage/PanelHeader gets our per-panel close button
  // and isFocusedPanel for input field appearance
  const contextOverride = useMemo(() => ({
    ...parentContext,
    rightSidebarButton: closeButton,
    isFocusedPanel,
  }), [parentContext, closeButton, isFocusedPanel])

  const handlePointerDown = useCallback(() => {
    if (!isFocusedPanel) {
      setFocusedPanel(entry.id)
    }
  }, [isFocusedPanel, setFocusedPanel, entry.id])

  return (
    <>
      {sash}
      <div
        onPointerDown={handlePointerDown}
        className={cn(
          'h-full overflow-hidden relative',
          'shadow-middle',
          'bg-foreground-2',
          !isOnly && !isPrimary && 'border-l border-foreground/5',
        )}
        style={{
          // In multi-panel, unfocused panels override --background so all
          // bg-background children render at the elevated (dimmed) background.
          ...(!isFocusedPanel && !isOnly
            ? {
                '--background': 'var(--background-elevated)',
                '--foreground': 'var(--foreground-dimmed)',
                color: 'var(--foreground)',
                '--shadow-minimal': 'var(--shadow-minimal-flat)',
                '--user-message-bubble': 'var(--user-message-bubble-dimmed)',
              } as React.CSSProperties
            : {}
          ),
          ...(isOnly
            ? {
                flexGrow: 1,
                minWidth: 0,
                borderTopLeftRadius: isFocusedMode ? 14 : 10,
                borderBottomLeftRadius: isFocusedMode ? 14 : 10,
                borderTopRightRadius: isRightSidebarVisible ? 10 : 14,
                borderBottomRightRadius: isRightSidebarVisible ? 10 : 14,
              }
            : {
                flexGrow: proportion,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: PANEL_MIN_WIDTH,
                borderTopLeftRadius: isPrimary ? (isFocusedMode ? 14 : 10) : 10,
                borderBottomLeftRadius: isPrimary ? (isFocusedMode ? 14 : 10) : 10,
                borderTopRightRadius: isLast ? 14 : 10,
                borderBottomRightRadius: isLast ? 14 : 10,
              }
          ),
        }}
      >
        <div className="h-full flex flex-col">
          <AppShellProvider value={contextOverride}>
            <MainContentPanel
              navStateOverride={navState}
              isFocusedMode={isFocusedMode}
            />
          </AppShellProvider>
        </div>
      </div>
    </>
  )
}
