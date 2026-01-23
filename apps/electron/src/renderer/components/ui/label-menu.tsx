import * as React from 'react'
import { cn } from '@/lib/utils'
import { LabelIcon } from './label-icon'
import type { LabelConfig } from '@craft-agent/shared/labels'
import { flattenLabels } from '@craft-agent/shared/labels'

// ============================================================================
// Types
// ============================================================================

export interface LabelMenuItem {
  id: string
  label: string
  config: LabelConfig
  /** Breadcrumb path for nested labels (e.g. "Priority / ") */
  parentPath?: string
}

export interface InlineLabelMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: LabelMenuItem[]
  onSelect: (labelId: string) => void
  filter?: string
  position: { x: number; y: number }
  workspaceId: string
  className?: string
}

// ============================================================================
// Shared Styles (matching slash-command-menu and mention-menu)
// ============================================================================

const MENU_CONTAINER_STYLE = 'overflow-hidden rounded-[8px] bg-background text-foreground shadow-modal-small'
const MENU_LIST_STYLE = 'max-h-[240px] overflow-y-auto py-1'
const MENU_ITEM_STYLE = 'flex cursor-pointer select-none items-center gap-2.5 rounded-[6px] mx-1 px-2 py-1.5 text-[13px]'
const MENU_ITEM_SELECTED = 'bg-foreground/5'

// ============================================================================
// Filter utilities
// ============================================================================

function filterItems(items: LabelMenuItem[], filter: string): LabelMenuItem[] {
  if (!filter) return items
  const lowerFilter = filter.toLowerCase()
  return items.filter(item =>
    item.label.toLowerCase().includes(lowerFilter) ||
    item.id.toLowerCase().includes(lowerFilter)
  )
}

// ============================================================================
// InlineLabelMenu Component
// ============================================================================

/**
 * Inline autocomplete menu for labels, triggered by # in the input.
 * Appears above the cursor position and allows keyboard navigation.
 */
export function InlineLabelMenu({
  open,
  onOpenChange,
  items,
  onSelect,
  filter = '',
  position,
  workspaceId,
  className,
}: InlineLabelMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const filteredItems = filterItems(items, filter)

  // Reset selection when filter changes
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  // Scroll selected item into view
  React.useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector('[data-selected="true"]')
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Keyboard navigation
  React.useEffect(() => {
    if (!open || filteredItems.length === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : 0))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredItems.length - 1))
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          if (filteredItems[selectedIndex]) {
            onSelect(filteredItems[selectedIndex].id)
            onOpenChange(false)
          }
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, filteredItems, selectedIndex, onSelect, onOpenChange])

  // Close on click outside
  React.useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onOpenChange(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onOpenChange])

  // Hide if no results or not open
  if (!open || filteredItems.length === 0) return null

  // Position menu above cursor
  const bottomPosition = typeof window !== 'undefined'
    ? window.innerHeight - Math.round(position.y) + 8
    : 0

  return (
    <div
      ref={menuRef}
      className={cn('fixed z-dropdown', MENU_CONTAINER_STYLE, className)}
      style={{ left: Math.round(position.x) - 10, bottom: bottomPosition, minWidth: 200, maxWidth: 260 }}
    >
      <div ref={listRef} className={MENU_LIST_STYLE}>
        {filteredItems.map((item, index) => {
          const isSelected = index === selectedIndex
          return (
            <div
              key={item.id}
              data-selected={isSelected}
              onClick={() => {
                onSelect(item.id)
                onOpenChange(false)
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              className={cn(
                MENU_ITEM_STYLE,
                isSelected && MENU_ITEM_SELECTED
              )}
            >
              {/* Label icon */}
              <div className="shrink-0">
                <LabelIcon
                  label={item.config}
                  workspaceId={workspaceId}
                  size="sm"
                />
              </div>
              {/* Label name with optional parent path */}
              <div className="flex-1 min-w-0 truncate">
                {item.parentPath && (
                  <span className="text-muted-foreground">{item.parentPath}</span>
                )}
                <span>{item.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Hook: useInlineLabelMenu
// ============================================================================

/** Interface for elements compatible with this hook */
export interface LabelMenuInputElement {
  getBoundingClientRect: () => DOMRect
  getCaretRect?: () => DOMRect | null
  value: string
  selectionStart: number
}

export interface UseInlineLabelMenuOptions {
  /** Ref to the input element */
  inputRef: React.RefObject<LabelMenuInputElement | null>
  /** Available labels (tree structure) */
  labels: LabelConfig[]
  /** Already-applied labels on the session (to exclude from menu) */
  sessionLabels?: string[]
  /** Callback when a label is selected */
  onSelect: (labelId: string) => void
  /** Workspace ID for icon loading */
  workspaceId: string
}

export interface UseInlineLabelMenuReturn {
  isOpen: boolean
  filter: string
  position: { x: number; y: number }
  items: LabelMenuItem[]
  handleInputChange: (value: string, cursorPosition: number) => void
  close: () => void
  /** Returns the cleaned input text after removing the #trigger text */
  handleSelect: (labelId: string) => string
}

/**
 * Hook that manages inline label menu state.
 * Detects # trigger in input text and shows a filterable menu of available labels.
 * Already-applied labels are excluded from the menu to prevent duplicates.
 */
export function useInlineLabelMenu({
  inputRef,
  labels,
  sessionLabels = [],
  onSelect,
  workspaceId,
}: UseInlineLabelMenuOptions): UseInlineLabelMenuReturn {
  const [isOpen, setIsOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [hashStart, setHashStart] = React.useState(-1)
  // Store current input state for handleSelect
  const currentInputRef = React.useRef({ value: '', cursorPosition: 0 })

  // Build flat menu items from label tree, excluding already-applied labels
  const items = React.useMemo((): LabelMenuItem[] => {
    const flat = flattenLabels(labels)
    return flat
      .filter(label => !sessionLabels.includes(label.id))
      .map(label => {
        // Build parent path breadcrumb for nested labels
        let parentPath: string | undefined
        const findParentPath = (tree: LabelConfig[], targetId: string, path: string[]): string[] | null => {
          for (const node of tree) {
            if (node.id === targetId) return path
            if (node.children) {
              const result = findParentPath(node.children, targetId, [...path, node.name])
              if (result) return result
            }
          }
          return null
        }
        const pathParts = findParentPath(labels, label.id, [])
        if (pathParts && pathParts.length > 0) {
          parentPath = pathParts.join(' / ') + ' / '
        }

        return {
          id: label.id,
          label: label.name,
          config: label,
          parentPath,
        }
      })
  }, [labels, sessionLabels])

  const handleInputChange = React.useCallback((value: string, cursorPosition: number) => {
    // Store current state for handleSelect
    currentInputRef.current = { value, cursorPosition }

    const textBeforeCursor = value.slice(0, cursorPosition)
    // Match # at start of input or after whitespace, followed by optional filter text
    const hashMatch = textBeforeCursor.match(/(?:^|\s)#([\w\-]*)$/)

    if (hashMatch && items.length > 0) {
      const filterText = hashMatch[1] || ''
      // Check if there are any filtered results before opening
      const filteredItems = filterItems(items, filterText)
      if (filteredItems.length === 0) {
        setIsOpen(false)
        setFilter('')
        setHashStart(-1)
        return
      }

      const matchStart = textBeforeCursor.lastIndexOf('#')
      setHashStart(matchStart)
      setFilter(filterText)

      if (inputRef.current) {
        // Try to get actual caret position
        const caretRect = inputRef.current.getCaretRect?.()
        if (caretRect && caretRect.x > 0) {
          setPosition({ x: caretRect.x, y: caretRect.y })
        } else {
          // Fallback: position at input element's left edge
          const rect = inputRef.current.getBoundingClientRect()
          const lineHeight = 20
          const linesBeforeCursor = textBeforeCursor.split('\n').length - 1
          setPosition({
            x: rect.left,
            y: rect.top + (linesBeforeCursor + 1) * lineHeight,
          })
        }
      }

      setIsOpen(true)
    } else {
      setIsOpen(false)
      setFilter('')
      setHashStart(-1)
    }
  }, [inputRef, items])

  // Handle label selection: remove #trigger text from input, call onSelect
  const handleSelect = React.useCallback((labelId: string): string => {
    let result = ''
    if (hashStart >= 0) {
      const { value: currentValue, cursorPosition } = currentInputRef.current
      const before = currentValue.slice(0, hashStart)
      const after = currentValue.slice(cursorPosition)
      result = (before + after).trim()
    }

    onSelect(labelId)
    setIsOpen(false)

    return result
  }, [onSelect, hashStart])

  const close = React.useCallback(() => {
    setIsOpen(false)
    setFilter('')
    setHashStart(-1)
  }, [])

  return {
    isOpen,
    filter,
    position,
    items,
    handleInputChange,
    close,
    handleSelect,
  }
}
