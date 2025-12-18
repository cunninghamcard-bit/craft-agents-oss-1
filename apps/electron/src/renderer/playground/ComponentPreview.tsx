import * as React from 'react'
import { cn } from '@/lib/utils'
import type { ComponentEntry } from './registry'

type BackgroundStyle = 'default' | 'light' | 'dark' | 'checkered'

interface ComponentPreviewProps {
  component: ComponentEntry
  props: Record<string, unknown>
}

export function ComponentPreview({ component, props }: ComponentPreviewProps) {
  const [bgStyle, setBgStyle] = React.useState<BackgroundStyle>('default')

  // Merge default props, mock data, and current props
  const mergedProps = React.useMemo(() => {
    const defaults: Record<string, unknown> = {}
    for (const prop of component.props) {
      defaults[prop.name] = prop.defaultValue
    }
    const mockData = component.mockData?.() ?? {}
    return { ...defaults, ...mockData, ...props }
  }, [component, props])

  // Render with optional wrapper
  const Component = component.component
  const Wrapper = component.wrapper ?? React.Fragment

  const bgClasses: Record<BackgroundStyle, string> = {
    default: 'bg-background',
    light: 'bg-white',
    dark: 'bg-zinc-900',
    checkered: 'bg-[length:20px_20px] bg-[linear-gradient(45deg,#f0f0f0_25%,transparent_25%),linear-gradient(-45deg,#f0f0f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f0f0f0_75%),linear-gradient(-45deg,transparent_75%,#f0f0f0_75%)] dark:bg-[linear-gradient(45deg,#2a2a2a_25%,transparent_25%),linear-gradient(-45deg,#2a2a2a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#2a2a2a_75%),linear-gradient(-45deg,transparent_75%,#2a2a2a_75%)]',
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground font-sans">
            {component.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {component.description}
          </p>
        </div>

        {/* Background style selector */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">Background:</span>
          {(['default', 'light', 'dark', 'checkered'] as BackgroundStyle[]).map(style => (
            <button
              key={style}
              onClick={() => setBgStyle(style)}
              className={cn(
                'px-2 py-1 rounded text-xs transition-colors',
                bgStyle === style
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {style.charAt(0).toUpperCase() + style.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className={cn(
            'min-h-[200px] rounded-lg border border-border p-4',
            bgClasses[bgStyle]
          )}
        >
          <Wrapper>
            <Component {...mergedProps} />
          </Wrapper>
        </div>
      </div>
    </div>
  )
}
