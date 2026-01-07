/**
 * Layout constants for consistent spacing and sizing across the app
 *
 * Chat-specific layout constants are imported from @craft-agent/ui
 * for consistency between Electron and web viewer.
 */

// Re-export shared chat layout from UI package
export { CHAT_LAYOUT, CHAT_CLASSES } from '@craft-agent/ui'

/**
 * Maximum width for main content areas (chat, settings, source info, etc.)
 * Ensures consistent readable width across different panels
 *
 * @deprecated Use CHAT_LAYOUT.maxWidth from @craft-agent/ui for chat content
 */
export const CONTENT_MAX_WIDTH = '960px'

/**
 * Tailwind class for content max-width with auto-centering
 * Usage: className="max-w-content mx-auto"
 *
 * @deprecated Use CHAT_LAYOUT.maxWidth from @craft-agent/ui for chat content
 */
export const CONTENT_MAX_WIDTH_CLASS = 'max-w-[960px]'
