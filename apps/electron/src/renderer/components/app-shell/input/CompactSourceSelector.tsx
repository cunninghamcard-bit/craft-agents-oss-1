import * as React from 'react'
import { Check, DatabaseZap } from 'lucide-react'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { SourceAvatar } from '@/components/ui/source-avatar'
import { cn } from '@/lib/utils'
import type { LoadedSource } from '../../../../shared/types'

interface CompactSourceSelectorProps {
  sources: LoadedSource[]
  selectedSlugs: string[]
  onToggleSlug: (slug: string) => void
}

export function CompactSourceSelector({
  sources,
  selectedSlugs,
  onToggleSlug,
}: CompactSourceSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const count = selectedSlugs.length

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `${count} source${count > 1 ? 's' : ''} active` : 'Sources'}
          className="h-7 pl-2 pr-2.5 text-xs font-medium rounded-[6px] flex items-center gap-1.5 shadow-tinted outline-none select-none shrink-0 bg-foreground/5 text-foreground/60"
          style={{ '--shadow-color': 'var(--foreground-rgb)' } as React.CSSProperties}
        >
          <DatabaseZap className="h-3.5 w-3.5" />
          {count > 0 && <span>{count}</span>}
        </button>
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Sources</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 flex flex-col gap-1">
          {sources.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No sources configured.
            </div>
          ) : (
            sources.map((source) => {
              const isSelected = selectedSlugs.includes(source.config.slug)
              return (
                <button
                  key={source.config.slug}
                  type="button"
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left transition-colors",
                    isSelected ? "bg-foreground/5" : "hover:bg-foreground/5",
                  )}
                  onClick={() => onToggleSlug(source.config.slug)}
                >
                  <span className="shrink-0">
                    <SourceAvatar source={source} size="sm" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{source.config.name}</div>
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-foreground/60" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
