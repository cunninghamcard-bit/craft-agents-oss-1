/**
 * SourceAvatar - Unified avatar component for sources
 *
 * Provides consistent styling for all source icons (global sources and subagent sources).
 * Uses CrossfadeAvatar internally for smooth image loading with fallback support.
 *
 * Two usage patterns:
 * 1. Direct props: <SourceAvatar type="mcp" name="Linear" logoUrl="..." />
 * 2. Source object: <SourceAvatar source={loadedSource} />
 *
 * Size variants:
 * - xs: 14x14 (compact)
 * - sm: 16x16 (dropdowns, inline, sidebar)
 * - md: 20x20 (auth steps)
 * - lg: 24x24 (info panels)
 */

import * as React from 'react'
import { CrossfadeAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Mail, Plug, Globe, HardDrive } from 'lucide-react'
import { McpIcon } from '@/components/icons/McpIcon'
import { getLogoUrl } from '@craft-agent/shared/utils/logo'
import type { LoadedSource } from '../../../../shared/types'

export type SourceType = 'mcp' | 'api' | 'gmail' | 'local'
export type SourceAvatarSize = 'xs' | 'sm' | 'md' | 'lg'

/** Props for direct usage with explicit type/name/logo */
interface DirectSourceAvatarProps {
  /** Source type for automatic fallback icon */
  type: SourceType
  /** Service name for alt text */
  name: string
  /** Logo URL (Google Favicon URL) - if not provided, derives from serviceUrl */
  logoUrl?: string | null
  /** Service URL to derive logo from (used if logoUrl not provided) */
  serviceUrl?: string
  /** Size variant */
  size?: SourceAvatarSize
  /** Additional className overrides */
  className?: string
  /** Not used in direct mode */
  source?: never
}

/** Props for usage with LoadedSource object */
interface LoadedSourceAvatarProps {
  /** LoadedSource object to extract type/name/logo from */
  source: LoadedSource
  /** Size variant */
  size?: SourceAvatarSize
  /** Additional className overrides */
  className?: string
  /** Not used in source mode */
  type?: never
  name?: never
  logoUrl?: never
  serviceUrl?: never
}

type SourceAvatarProps = DirectSourceAvatarProps | LoadedSourceAvatarProps

// Size configurations
const SIZE_CONFIG: Record<SourceAvatarSize, { container: string; icon: string }> = {
  xs: { container: 'h-3.5 w-3.5', icon: 'h-2 w-2' },
  sm: { container: 'h-4 w-4', icon: 'h-2 w-2' },
  md: { container: 'h-5 w-5', icon: 'h-2.5 w-2.5' },
  lg: { container: 'h-6 w-6', icon: 'h-3.5 w-3.5' },
}

// Fallback icons by source type
const FALLBACK_ICONS: Record<SourceType, React.ComponentType<{ className?: string }>> = {
  mcp: McpIcon,
  api: Globe,
  gmail: Mail,
  local: HardDrive,
}

/**
 * Get the fallback icon for a source type
 */
export function getSourceFallbackIcon(type: SourceType): React.ComponentType<{ className?: string }> {
  return FALLBACK_ICONS[type] ?? Plug
}

/**
 * Helper to extract service URL from a LoadedSource for logo derivation
 */
function getSourceServiceUrl(source: LoadedSource): string | undefined {
  const config = source.config
  if (config.mcp?.url) return config.mcp.url
  if (config.api?.baseUrl) return config.api.baseUrl
  if (config.local?.websiteUrl) return config.local.websiteUrl
  return undefined
}

export function SourceAvatar(props: SourceAvatarProps) {
  const { size = 'md', className } = props

  // Extract type, name, and logo URL based on props variant
  let type: SourceType
  let name: string
  let resolvedLogoUrl: string | null

  if ('source' in props && props.source) {
    // LoadedSource mode
    const source = props.source
    type = source.config.type as SourceType
    name = source.config.name
    const serviceUrl = getSourceServiceUrl(source)
    resolvedLogoUrl = serviceUrl ? getLogoUrl(serviceUrl) : null
  } else {
    // Direct props mode
    const directProps = props as DirectSourceAvatarProps
    type = directProps.type
    name = directProps.name
    resolvedLogoUrl = directProps.logoUrl ?? (directProps.serviceUrl ? getLogoUrl(directProps.serviceUrl) : null)
  }

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
