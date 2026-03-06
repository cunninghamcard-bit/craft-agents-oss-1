import * as React from 'react'
import { motion } from 'motion/react'
import { Check, X } from 'lucide-react'
import { IslandContentView, useIslandAnimationConfig } from './Island'

export interface IslandFollowUpContentViewProps {
  id: string
  value: string
  onValueChange: (next: string) => void
  onCancel: () => void
  onSubmit: (value: string) => void
  title?: string
  placeholder?: string
  maxInputHeight?: number
}

/**
 * Reusable Follow-up confirmation view for Island flows.
 *
 * - Uses multiline textarea input
 * - Esc cancels
 * - Cmd/Ctrl+Enter submits
 */
export function IslandFollowUpContentView({
  id,
  value,
  onValueChange,
  onCancel,
  onSubmit,
  title = 'Follow up',
  placeholder = 'Add comments the agent should consider in the next turn…',
  maxInputHeight = 400,
}: IslandFollowUpContentViewProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const measureTextareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [inputHeight, setInputHeight] = React.useState(76)
  const [inputOverflow, setInputOverflow] = React.useState(false)
  const islandAnimation = useIslandAnimationConfig()

  const submitShortcut = React.useMemo(() => {
    if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) {
      return '⌘ + Enter'
    }
    return 'Ctrl + Enter'
  }, [])

  const inputTransition = React.useMemo(
    () => ({ type: 'spring' as const, duration: islandAnimation.duration, bounce: islandAnimation.bounce }),
    [islandAnimation.duration, islandAnimation.bounce]
  )

  React.useLayoutEffect(() => {
    const measure = measureTextareaRef.current
    if (!measure) return

    measure.value = value
    const measured = measure.scrollHeight
    const nextHeight = Math.min(measured, maxInputHeight)
    const nextOverflow = measured > maxInputHeight

    setInputHeight((prev) => (prev === nextHeight ? prev : nextHeight))
    setInputOverflow((prev) => (prev === nextOverflow ? prev : nextOverflow))
  }, [value, maxInputHeight])

  return (
    <IslandContentView id={id} anchorX="center" anchorY="top">
      <div className="w-[440px] p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{title}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
            aria-label="Back"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="relative rounded-[8px] border border-border/70 px-3 py-2 bg-background shadow-minimal">
          <textarea
            ref={measureTextareaRef}
            aria-hidden="true"
            tabIndex={-1}
            readOnly
            rows={3}
            value={value}
            className="pointer-events-none absolute left-3 right-3 top-2 resize-none overflow-hidden bg-transparent text-sm leading-5 opacity-0"
          />

          <motion.textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancel()
              }

              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                onSubmit(value)
              }
            }}
            placeholder={placeholder}
            rows={3}
            initial={false}
            animate={{ height: inputHeight }}
            transition={inputTransition}
            style={{ overflowY: inputOverflow ? 'auto' : 'hidden' }}
            className="relative w-full resize-none bg-transparent outline-none text-sm leading-5"
          />
        </div>

        <div className="flex justify-between items-center pt-1 shrink-0">
          <div className="text-[11px] text-foreground/50">Press {submitShortcut} to continue</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3 rounded-[8px] text-sm text-foreground/75 hover:bg-foreground/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(value)}
              className="h-8 px-3 rounded-[8px] text-sm bg-foreground text-background inline-flex items-center gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Continue
            </button>
          </div>
        </div>
      </div>
    </IslandContentView>
  )
}
