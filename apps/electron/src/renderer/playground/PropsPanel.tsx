import * as React from 'react'
import { cn } from '@/lib/utils'
import type { ComponentEntry, PropDefinition, ComponentVariant } from './registry'

interface PropsPanelProps {
  component: ComponentEntry
  props: Record<string, unknown>
  onPropsChange: (props: Record<string, unknown>) => void
  selectedVariant: string | null
  onVariantSelect: (variant: ComponentVariant) => void
}

export function PropsPanel({
  component,
  props,
  onPropsChange,
  selectedVariant,
  onVariantSelect,
}: PropsPanelProps) {
  const handlePropChange = (name: string, value: unknown) => {
    onPropsChange({ ...props, [name]: value })
  }

  return (
    <div className="h-72 border-t border-border bg-background overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Variants */}
        {component.variants && component.variants.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Variants
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {component.variants.map(variant => (
                <button
                  key={variant.name}
                  onClick={() => onVariantSelect(variant)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    selectedVariant === variant.name
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/5 text-foreground hover:bg-foreground/10'
                  )}
                >
                  {variant.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Props */}
        {component.props.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Props
            </label>
            <div className="mt-2 space-y-3">
              {component.props.map(propDef => (
                <PropControl
                  key={propDef.name}
                  definition={propDef}
                  value={props[propDef.name]}
                  onChange={value => handlePropChange(propDef.name, value)}
                />
              ))}
            </div>
          </div>
        )}

        {/* No controls message */}
        {component.props.length === 0 && (!component.variants || component.variants.length === 0) && (
          <p className="text-sm text-muted-foreground italic">
            This component has no configurable props.
          </p>
        )}
      </div>
    </div>
  )
}

interface PropControlProps {
  definition: PropDefinition
  value: unknown
  onChange: (value: unknown) => void
}

function PropControl({ definition, value, onChange }: PropControlProps) {
  const { name, description, control } = definition

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          {name}
        </label>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>

      {control.type === 'boolean' && (
        <button
          onClick={() => onChange(!value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-mono transition-colors',
            value
              ? 'bg-green-500/20 text-green-600 dark:text-green-400'
              : 'bg-foreground/5 text-muted-foreground'
          )}
        >
          {String(value)}
        </button>
      )}

      {control.type === 'string' && (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={control.placeholder}
          className="w-full px-3 py-1.5 rounded-md bg-foreground/5 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}

      {control.type === 'textarea' && (
        <textarea
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={control.placeholder}
          rows={control.rows ?? 4}
          className="w-full px-3 py-1.5 rounded-md bg-foreground/5 border border-border text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}

      {control.type === 'number' && (
        <input
          type="number"
          value={Number(value ?? 0)}
          onChange={e => onChange(Number(e.target.value))}
          min={control.min}
          max={control.max}
          step={control.step}
          className="w-24 px-3 py-1.5 rounded-md bg-foreground/5 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}

      {control.type === 'select' && (
        <select
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-1.5 rounded-md bg-foreground/5 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {control.options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
