/**
 * LabelIcon - Renders a label's icon or a colored circle fallback.
 *
 * Unlike other entity icons (sources, skills), labels render WITHOUT a
 * background container — just the raw icon or a colored circle.
 *
 * Rendering:
 * - Emoji: plain text at appropriate size
 * - File (colorable SVG): inline SVG, color inherited via currentColor
 * - File (non-colorable): <img> at appropriate size
 * - No icon: small filled circle in the label's color
 */

import { useEntityIcon } from '@/lib/icon-cache'
import type { IconSize } from '@craft-agent/shared/icons'
import { ICON_SIZE_CLASSES, ICON_EMOJI_SIZES } from '@craft-agent/shared/icons'
import type { EntityColor } from '@craft-agent/shared/colors'
import { resolveEntityColor } from '@craft-agent/shared/colors'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

interface LabelIconProps {
  /** Label configuration (matches LabelConfig from @craft-agent/shared/labels) */
  label: {
    id: string
    icon?: string
    /** EntityColor: system color string or custom color object */
    color?: EntityColor
  }
  /** Workspace ID for loading local icons */
  workspaceId: string
  /** Size variant (default: 'sm' - labels are typically small inline elements) */
  size?: IconSize
  /** Additional className */
  className?: string
}

/** Circle diameter in pixels for each icon size */
const CIRCLE_SIZES: Record<IconSize, number> = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
}

export function LabelIcon({ label, workspaceId, size = 'sm', className }: LabelIconProps) {
  const { isDark } = useTheme()
  const icon = useEntityIcon({
    workspaceId,
    entityType: 'label',
    identifier: label.id,
    iconDir: 'labels/icons',
    iconFileName: label.id,
    iconValue: label.icon,
  })

  // Resolve the label's color for inline styling
  const resolvedColor = label.color
    ? resolveEntityColor(label.color, isDark)
    : undefined

  // No icon: small colored circle
  if (icon.kind === 'fallback') {
    const diameter = CIRCLE_SIZES[size]
    return (
      <span
        className={cn('inline-flex items-center justify-center shrink-0', className)}
        style={{ width: diameter, height: diameter }}
      >
        <span
          className="rounded-full w-full h-full"
          style={{
            backgroundColor: resolvedColor || 'currentColor',
            opacity: resolvedColor ? 1 : 0.4,
          }}
        />
      </span>
    )
  }

  // Emoji: render as plain text, no background
  if (icon.kind === 'emoji') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 leading-none',
          ICON_SIZE_CLASSES[size],
          ICON_EMOJI_SIZES[size],
          className,
        )}
        style={resolvedColor ? { color: resolvedColor } : undefined}
      >
        {icon.value}
      </span>
    )
  }

  // File icon: colorable SVG rendered inline, or <img> for raster/non-colorable
  if (icon.colorable && icon.rawSvg) {
    return (
      <span
        className={cn('inline-flex shrink-0', ICON_SIZE_CLASSES[size], className)}
        style={resolvedColor ? { color: resolvedColor } : undefined}
        dangerouslySetInnerHTML={{ __html: icon.rawSvg }}
      />
    )
  }

  // Non-colorable file (raster image or SVG with hardcoded colors)
  return (
    <img
      src={icon.value}
      alt=""
      className={cn('shrink-0 object-contain', ICON_SIZE_CLASSES[size], className)}
    />
  )
}
