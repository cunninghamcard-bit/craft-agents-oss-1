/**
 * ShikiCodeViewer - Electron wrapper for the portable ShikiCodeViewer
 *
 * This thin wrapper imports the portable component from @craft-agent/ui
 * and connects it to Electron's ThemeContext.
 */

import * as React from 'react'
import { ShikiCodeViewer as BaseShikiCodeViewer, type ShikiCodeViewerProps as BaseProps } from '@craft-agent/ui'
import { useTheme } from '@/context/ThemeContext'

export interface ShikiCodeViewerProps extends Omit<BaseProps, 'theme'> {}

/**
 * ShikiCodeViewer - Syntax highlighted code viewer with line numbers
 * Connected to Electron's theme context.
 */
export function ShikiCodeViewer(props: ShikiCodeViewerProps) {
  const { resolvedMode } = useTheme()

  return <BaseShikiCodeViewer {...props} theme={resolvedMode} />
}
