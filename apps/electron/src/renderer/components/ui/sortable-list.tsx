/**
 * Sortable List - Flat list drag-and-drop reordering
 *
 * Uses @dnd-kit for polished DnD with:
 * - PointerSensor (5px activation distance to prevent accidental drags)
 * - KeyboardSensor for accessibility
 * - DragOverlay portaled to document.body (prevents clipping by sidebar overflow)
 * - Two-phase drop animation: overlay fades out while ghost fades in at new position
 * - Smooth sibling reflow via CSS transforms
 *
 * Usage:
 *   <SortableList items={items} onReorder={handleReorder} renderItem={renderItem} />
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DropAnimation,
  type MeasuringConfiguration,
  MeasuringStrategy,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ============================================================
// Custom PointerSensor — skips drag activation on elements with data-no-dnd
// This allows interactive elements (e.g., chevron toggles) to receive clicks
// even when nested inside a draggable container.
// ============================================================

function hasNoDndAncestor(element: HTMLElement | null): boolean {
  while (element) {
    if (element.dataset?.noDnd === 'true') return true
    element = element.parentElement
  }
  return false
}

export class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) => {
        // Skip drag activation if click target has data-no-dnd="true" (or any ancestor does)
        if (hasNoDndAncestor(nativeEvent.target as HTMLElement)) {
          return false
        }
        return true
      },
    },
  ]
}

// ============================================================
// Drop Animation Config (dnd-kit tree collapsible style)
// Two-phase: overlay fades out with slight offset, ghost fades in at new position.
// This creates the "settle into place" effect.
// ============================================================

const DROP_ANIMATION_DURATION = 250

const dropAnimationConfig: DropAnimation = {
  keyframes({ transform }) {
    return [
      { opacity: 1, transform: CSS.Transform.toString(transform.initial) },
      {
        opacity: 0,
        transform: CSS.Transform.toString({
          ...transform.final,
          x: transform.final.x + 5,
          y: transform.final.y + 5,
        }),
      },
    ]
  },
  duration: DROP_ANIMATION_DURATION,
  easing: 'ease-out',
  sideEffects({ active }) {
    // Ghost fades in at new position (the "settle into place" effect)
    active.node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DROP_ANIMATION_DURATION,
      easing: 'ease',
    })
  },
}

// Measuring config: always re-measure to support animated layouts
const measuringConfig: MeasuringConfiguration = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
}

// ============================================================
// Types
// ============================================================

export interface SortableItemData {
  /** Unique ID for this item (used as sortable key) */
  id: string
}

interface SortableListProps<T extends SortableItemData> {
  /** Array of items to render (must have unique `id` fields) */
  items: T[]
  /** Called with the new ordered array after a drop */
  onReorder: (items: T[]) => void
  /** Render function for each item. `isDragging` is true when this item is being dragged. */
  renderItem: (item: T, isDragging: boolean) => React.ReactNode
  /** Render the drag overlay content (clone shown while dragging). Falls back to renderItem. */
  renderOverlay?: (item: T) => React.ReactNode
  /** Additional className for the list container */
  className?: string
}

// ============================================================
// SortableList Component
// ============================================================

export function SortableList<T extends SortableItemData>({
  items,
  onReorder,
  renderItem,
  renderOverlay,
  className,
}: SortableListProps<T>) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  // Sensors: SmartPointerSensor skips data-no-dnd elements, 5px distance threshold
  const sensors = useSensors(
    useSensor(SmartPointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor)
  )

  const activeItem = React.useMemo(
    () => items.find(item => item.id === activeId),
    [items, activeId]
  )

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const oldIndex = items.findIndex(item => item.id === active.id)
    const newIndex = items.findIndex(item => item.id === over.id)

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(items, oldIndex, newIndex))
    }
  }, [items, onReorder])

  const handleDragCancel = React.useCallback(() => {
    setActiveId(null)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      measuring={measuringConfig}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map(item => (
            <SortableItemWrapper
              key={item.id}
              id={item.id}
              isDragActive={activeId === item.id}
            >
              {renderItem(item, activeId === item.id)}
            </SortableItemWrapper>
          ))}
        </div>
      </SortableContext>

      {/* Drag overlay portaled to document.body — never clipped by sidebar overflow */}
      {createPortal(
        <DragOverlay dropAnimation={dropAnimationConfig}>
          {activeItem ? (
            <div className="sortable-overlay rounded-[6px] shadow-xl ring-1 ring-foreground/10 bg-background scale-[1.02] z-[9999]">
              {(renderOverlay ?? renderItem)(activeItem, false)}
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  )
}

// ============================================================
// SortableItemWrapper - wraps each item with useSortable
// ============================================================

interface SortableItemWrapperProps {
  id: string
  isDragActive: boolean
  children: React.ReactNode
}

function SortableItemWrapper({ id, isDragActive, children }: SortableItemWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  // CSS transform for smooth reflow during drag (GPU-accelerated)
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Ghost: fully hidden while dragging (overlay shows the item instead)
    opacity: isDragging ? 0 : 1,
    cursor: isDragActive ? 'grabbing' : 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export { arrayMove } from '@dnd-kit/sortable'
