/**
 * Panel Stack State
 *
 * Manages a stack of panels displayed side-by-side in the main content area.
 * Each panel is identified by a ViewRoute (deeplink string) and a proportion
 * that determines its share of the available content width.
 *
 * - Panel at index 0 is the "primary" panel, synced with NavigationContext
 * - Panels at index 1+ are "secondary" panels pushed from UI interactions
 * - Closing a panel removes only that panel; panels to its right are preserved
 * - Proportions are relative weights that sum to 1.0 across all panels
 */

import { atom } from 'jotai'
import type { ViewRoute } from '../../shared/routes'

let nextPanelId = 0
function generatePanelId(): string {
  return `panel-${++nextPanelId}-${Date.now()}`
}

export interface PanelStackEntry {
  /** Unique ID for React key / AnimatePresence */
  id: string
  /** The deeplink route that determines what renders in this panel */
  route: ViewRoute
  /** Proportion of available content width (0–1, all proportions sum to 1.0) */
  proportion: number
}

/** The panel stack — first entry is always the "primary" panel */
export const panelStackAtom = atom<PanelStackEntry[]>([])

/** Which panel is currently focused (null = defaults to primary) */
export const focusedPanelIdAtom = atom<string | null>(null)

/** Derived: the primary (index 0) route — syncs with NavigationContext */
export const primaryPanelRouteAtom = atom(
  (get) => get(panelStackAtom)[0]?.route ?? null
)

/** Derived: number of panels in the stack */
export const panelCountAtom = atom(
  (get) => get(panelStackAtom).length
)

/** Derived: the focused panel's index in the stack (defaults to 0) */
export const focusedPanelIndexAtom = atom((get) => {
  const stack = get(panelStackAtom)
  const focusedId = get(focusedPanelIdAtom)
  if (!focusedId) return 0
  const idx = stack.findIndex(p => p.id === focusedId)
  return idx === -1 ? 0 : idx
})

/** Derived: the focused panel's route */
export const focusedPanelRouteAtom = atom((get) => {
  const stack = get(panelStackAtom)
  const idx = get(focusedPanelIndexAtom)
  return stack[idx]?.route ?? null
})

/**
 * Extract a session ID from a ViewRoute string.
 * Routes containing '/session/{id}' have a session detail view.
 */
export function parseSessionIdFromRoute(route: ViewRoute): string | null {
  const segments = route.split('/')
  const idx = segments.indexOf('session')
  if (idx >= 0 && idx + 1 < segments.length) {
    return segments[idx + 1]
  }
  return null
}

/** Derived: the session ID of the focused panel (null if not viewing a session) */
export const focusedSessionIdAtom = atom((get) => {
  const route = get(focusedPanelRouteAtom)
  if (!route) return null
  return parseSessionIdFromRoute(route)
})

/**
 * Push a new panel onto the stack.
 * If afterIndex is specified, truncates everything after that index first.
 * All panels get equal proportions after push (distribute mode).
 */
export const pushPanelAtom = atom(
  null,
  (get, set, { route, afterIndex }: { route: ViewRoute; afterIndex?: number }) => {
    const stack = get(panelStackAtom)
    const insertAt = afterIndex !== undefined ? afterIndex + 1 : stack.length
    const kept = stack.slice(0, insertAt)
    const newEntry: PanelStackEntry = { id: generatePanelId(), route, proportion: 0 }
    const newStack = [...kept, newEntry]
    // Distribute equally
    const equal = 1 / newStack.length
    set(panelStackAtom, newStack.map(p => ({ ...p, proportion: equal })))
    // Auto-focus the newly pushed panel
    set(focusedPanelIdAtom, newEntry.id)
  }
)

/**
 * Close a panel by ID. Only removes the targeted panel.
 * Cannot close the primary panel (index 0).
 * Redistributes the closed panels' proportions among remaining panels.
 */
export const closePanelAtom = atom(
  null,
  (get, set, id: string) => {
    const stack = get(panelStackAtom)
    const idx = stack.findIndex(p => p.id === id)
    if (idx > 0) {
      const remaining = [...stack.slice(0, idx), ...stack.slice(idx + 1)]
      // Normalize proportions so they sum to 1.0
      const totalProportion = remaining.reduce((sum, p) => sum + p.proportion, 0)
      if (totalProportion > 0) {
        set(panelStackAtom, remaining.map(p => ({
          ...p,
          proportion: p.proportion / totalProportion,
        })))
      } else {
        set(panelStackAtom, remaining)
      }
      // If the closed panel was focused, move focus to the left neighbor
      if (get(focusedPanelIdAtom) === id) {
        const newIdx = Math.min(idx, remaining.length - 1)
        set(focusedPanelIdAtom, remaining[newIdx]?.id ?? null)
      }
    }
  }
)

/** Close all secondary panels (keep only the primary) */
export const closeAllSecondaryPanelsAtom = atom(
  null,
  (get, set) => {
    const stack = get(panelStackAtom)
    if (stack.length > 1) {
      set(panelStackAtom, [{ ...stack[0], proportion: 1 }])
      set(focusedPanelIdAtom, stack[0].id)
    }
  }
)

/**
 * Restore the full panel stack from serialized state (URL restoration, deeplinks).
 * Sets all panels atomically — avoids the race condition of sequential pushPanelAtom calls
 * where updatePrimaryPanelAtom overwrites the first secondary panel.
 */
export const restorePanelStackAtom = atom(
  null,
  (_get, set, entries: { route: ViewRoute; proportion: number }[]) => {
    if (entries.length === 0) return
    const stack = entries.map(e => ({
      id: generatePanelId(),
      route: e.route,
      proportion: e.proportion,
    }))
    set(panelStackAtom, stack)
    set(focusedPanelIdAtom, stack[0].id)
  }
)

/**
 * Update the primary panel's route (index 0).
 * Called by NavigationContext when navigation changes.
 */
export const updatePrimaryPanelAtom = atom(
  null,
  (get, set, route: ViewRoute) => {
    const stack = get(panelStackAtom)
    if (stack.length === 0) {
      set(panelStackAtom, [{ id: generatePanelId(), route, proportion: 1 }])
    } else if (stack[0].route !== route) {
      set(panelStackAtom, [{ ...stack[0], route }, ...stack.slice(1)])
    }
  }
)

/**
 * Resize two adjacent panels by updating their proportions.
 * Called by PanelResizeSash during drag.
 */
export const resizePanelsAtom = atom(
  null,
  (get, set, { leftIndex, rightIndex, leftProportion, rightProportion }: {
    leftIndex: number
    rightIndex: number
    leftProportion: number
    rightProportion: number
  }) => {
    const stack = get(panelStackAtom)
    if (leftIndex < 0 || rightIndex >= stack.length) return
    const newStack = stack.map((p, i) => {
      if (i === leftIndex) return { ...p, proportion: leftProportion }
      if (i === rightIndex) return { ...p, proportion: rightProportion }
      return p
    })
    set(panelStackAtom, newStack)
  }
)

/**
 * Update the focused panel's route.
 * Used by the navigator to navigate a secondary panel without going through NavigationContext.
 */
export const updateFocusedPanelRouteAtom = atom(
  null,
  (get, set, route: ViewRoute) => {
    const stack = get(panelStackAtom)
    const idx = get(focusedPanelIndexAtom)
    if (idx < 0 || idx >= stack.length) return
    const newStack = stack.map((p, i) =>
      i === idx ? { ...p, route } : p
    )
    set(panelStackAtom, newStack)
  }
)

/** Focus the next panel in the stack (wraps around) */
export const focusNextPanelAtom = atom(
  null,
  (get, set) => {
    const stack = get(panelStackAtom)
    if (stack.length <= 1) return
    const currentIdx = get(focusedPanelIndexAtom)
    const nextIdx = (currentIdx + 1) % stack.length
    set(focusedPanelIdAtom, stack[nextIdx].id)
  }
)

/** Focus the previous panel in the stack (wraps around) */
export const focusPrevPanelAtom = atom(
  null,
  (get, set) => {
    const stack = get(panelStackAtom)
    if (stack.length <= 1) return
    const currentIdx = get(focusedPanelIndexAtom)
    const prevIdx = (currentIdx - 1 + stack.length) % stack.length
    set(focusedPanelIdAtom, stack[prevIdx].id)
  }
)
