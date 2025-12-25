/**
 * ConnectionAvatar - Unified avatar component for connections
 *
 * Provides consistent styling for all connection icons (global connections and subagent connections).
 * Uses CrossfadeAvatar internally for smooth image loading with fallback support.
 *
 * Size variants:
 * - sm: 16x16 (dropdowns, inline, sidebar)
 * - md: 20x20 (auth steps)
 * - lg: 24x24 (info panels)
 */

import * as React from 'react'
import { CrossfadeAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Mail, Plug, Globe } from 'lucide-react'
import { McpIcon } from '@/components/icons/McpIcon'
import { getLogoUrl } from '@craft-agent/shared/utils/logo'

export type ConnectionType = 'mcp' | 'api' | 'gmail'
export type ConnectionAvatarSize = 'xs' | 'sm' | 'md' | 'lg'

interface ConnectionAvatarProps {
  /** Connection type for automatic fallback icon */
  type: ConnectionType
  /** Service name for alt text */
  name: string
  /** Logo URL (Google Favicon URL) - if not provided, derives from serviceUrl */
  logoUrl?: string | null
  /** Service URL to derive logo from (used if logoUrl not provided) */
  serviceUrl?: string
  /** Size variant */
  size?: ConnectionAvatarSize
  /** Additional className overrides */
  className?: string
}

// Size configurations
const SIZE_CONFIG: Record<ConnectionAvatarSize, { container: string; icon: string }> = {
  xs: { container: 'h-3.5 w-3.5', icon: 'h-2 w-2' },
  sm: { container: 'h-4 w-4', icon: 'h-2 w-2' },
  md: { container: 'h-5 w-5', icon: 'h-2.5 w-2.5' },
  lg: { container: 'h-6 w-6', icon: 'h-3.5 w-3.5' },
}

// Fallback icons by connection type
const FALLBACK_ICONS: Record<ConnectionType, React.ComponentType<{ className?: string }>> = {
  mcp: McpIcon,
  api: Globe,
  gmail: Mail,
}

/**
 * Get the fallback icon for a connection type
 */
export function getConnectionFallbackIcon(type: ConnectionType): React.ComponentType<{ className?: string }> {
  return FALLBACK_ICONS[type] ?? Plug
}

export function ConnectionAvatar({
  type,
  name,
  logoUrl,
  serviceUrl,
  size = 'md',
  className,
}: ConnectionAvatarProps) {
  // Resolve logo URL: use provided logoUrl, or derive from serviceUrl
  const resolvedLogoUrl = logoUrl ?? (serviceUrl ? getLogoUrl(serviceUrl) : null)

  const sizeConfig = SIZE_CONFIG[size]
  const FallbackIcon = FALLBACK_ICONS[type] ?? Plug

  return (
    <CrossfadeAvatar
      src={resolvedLogoUrl}
      alt={name}
      className={cn(
        sizeConfig.container,
        'rounded-[4px] ring-1 ring-border/30 shrink-0',
        className
      )}
      fallbackClassName="bg-muted"
      fallback={<FallbackIcon className={cn(sizeConfig.icon, 'text-muted-foreground')} />}
    />
  )
}
