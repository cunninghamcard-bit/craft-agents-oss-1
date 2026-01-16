/**
 * PermissionsSettingsPage
 *
 * Displays permissions configuration for Explore mode.
 * Shows both default patterns (from SAFE_MODE_CONFIG) and custom workspace additions.
 *
 * Default patterns are read-only - they show what's built into Explore mode.
 * Custom patterns can be edited via permissions.json file.
 */

import * as React from 'react'
import { useState, useEffect, useMemo } from 'react'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react'
import { useAppShellContext } from '@/context/AppShellContext'
import { SAFE_MODE_CONFIG, type PermissionsConfigFile } from '@craft-agent/shared/agent/modes'
import {
  PermissionsDataTable,
  type PermissionRow,
} from '@/components/info'
import {
  SettingsSection,
  SettingsCard,
} from '@/components/settings'
import type { DetailsPageMeta } from '@/lib/navigation-registry'

export const meta: DetailsPageMeta = {
  navigator: 'settings',
  slug: 'permissions',
}

/**
 * Convert RegExp patterns to display strings with categorization.
 * Strips regex delimiters for cleaner display.
 */
function regexToDisplayString(regex: RegExp): string {
  // Get the source pattern without the leading ^ if present (common in command patterns)
  const source = regex.source
  return source
}

/**
 * Categorize bash patterns for better organization.
 * Returns a human-readable comment based on the pattern.
 */
function categorizeBashPattern(pattern: string): string {
  // File operations
  if (/^(ls|ll|la|tree|file|stat|du|df|wc|head|tail|cat|less|more|bat)\b/.test(pattern)) {
    return 'File listing and inspection'
  }
  // Search
  if (/^(find|locate|which|whereis|type|grep|rg|ag|ack|fd|fzf)\b/.test(pattern)) {
    return 'Search and find'
  }
  // Git
  if (/^git\s/.test(pattern)) {
    return 'Git read operations'
  }
  // GitHub CLI
  if (/^gh\s/.test(pattern)) {
    return 'GitHub CLI read operations'
  }
  // Package managers
  if (/^(npm|yarn|pnpm|bun|pip|pip3|cargo|go|composer|gem|bundle)\s/.test(pattern)) {
    return 'Package manager read operations'
  }
  // System info
  if (/^(pwd|whoami|id|groups|uname|hostname|date|uptime|env|printenv|echo\s+\$|ps|top|htop|free|vmstat|iostat|lscpu|lsmem|lsblk|lsusb|lspci)\b/.test(pattern)) {
    return 'System info'
  }
  // Docker
  if (/^docker/.test(pattern)) {
    return 'Docker read operations'
  }
  // Kubernetes
  if (/^kubectl/.test(pattern)) {
    return 'Kubernetes read operations'
  }
  // Text processing
  if (/^(sed|sort|uniq|cut|tr|column|jq|yq|xq|xmllint|json_pp|python\s+-m\s+json\.tool)\b/.test(pattern)) {
    return 'Text processing (read-only)'
  }
  // Network
  if (/^(ping|traceroute|tracepath|mtr|dig|nslookup|host|netstat|ss|ip\s|ifconfig)\b/.test(pattern)) {
    return 'Network diagnostics'
  }
  // Version checks
  if (/--version|-[vV]\b/.test(pattern) || /\bversion\b/.test(pattern)) {
    return 'Version checks'
  }
  // Help
  if (/--help|-h\b|^man\b/.test(pattern)) {
    return 'Help commands'
  }
  return ''
}

/**
 * Build default permissions data from SAFE_MODE_CONFIG.
 * These are the built-in Explore mode patterns (allowed commands only).
 * We don't show default blocked tools as that's confusing - blocking is the default behavior.
 */
function buildDefaultPermissionsData(): PermissionRow[] {
  const rows: PermissionRow[] = []

  // Read-only bash patterns (allowed)
  SAFE_MODE_CONFIG.readOnlyBashPatterns.forEach((regex) => {
    const pattern = regexToDisplayString(regex)
    const comment = categorizeBashPattern(pattern)
    rows.push({
      access: 'allowed',
      type: 'bash',
      pattern,
      comment: comment || null,
    })
  })

  // Read-only MCP patterns (allowed)
  SAFE_MODE_CONFIG.readOnlyMcpPatterns.forEach((regex) => {
    const pattern = regexToDisplayString(regex)
    rows.push({
      access: 'allowed',
      type: 'mcp',
      pattern,
      comment: 'MCP read operation',
    })
  })

  return rows
}

/**
 * Build custom permissions data from workspace permissions.json.
 * These are user-added patterns that extend the defaults.
 */
function buildCustomPermissionsData(config: PermissionsConfigFile): PermissionRow[] {
  const rows: PermissionRow[] = []

  // Additional blocked tools
  config.blockedTools?.forEach((tool) => {
    rows.push({ access: 'blocked', type: 'tool', pattern: tool, comment: 'Custom blocked tool' })
  })

  // Additional bash patterns
  config.allowedBashPatterns?.forEach((item) => {
    const pattern = typeof item === 'string' ? item : item.pattern
    const comment = typeof item === 'string' ? 'Custom bash pattern' : (item.comment || 'Custom bash pattern')
    rows.push({ access: 'allowed', type: 'bash', pattern, comment })
  })

  // Additional MCP patterns
  config.allowedMcpPatterns?.forEach((item) => {
    const pattern = typeof item === 'string' ? item : item.pattern
    const comment = typeof item === 'string' ? 'Custom MCP pattern' : (item.comment || 'Custom MCP pattern')
    rows.push({ access: 'allowed', type: 'mcp', pattern, comment })
  })

  // API endpoints
  config.allowedApiEndpoints?.forEach((item) => {
    const pattern = `${item.method} ${item.path}`
    rows.push({ access: 'allowed', type: 'api', pattern, comment: item.comment || 'Custom API endpoint' })
  })

  // Write paths are shown as allowed paths
  config.allowedWritePaths?.forEach((item) => {
    const pattern = typeof item === 'string' ? item : item.pattern
    const comment = typeof item === 'string' ? 'Allowed write path' : (item.comment || 'Allowed write path')
    // Show as a special "tool" type since it's about Write/Edit operations
    rows.push({ access: 'allowed', type: 'tool', pattern: `Write to: ${pattern}`, comment })
  })

  return rows
}

export default function PermissionsSettingsPage() {
  const { activeWorkspaceId } = useAppShellContext()

  // Loading and data state
  const [isLoading, setIsLoading] = useState(true)
  const [customConfig, setCustomConfig] = useState<PermissionsConfigFile | null>(null)

  // Build default permissions data (memoized since SAFE_MODE_CONFIG is static)
  const defaultPermissionsData = useMemo(() => buildDefaultPermissionsData(), [])

  // Build custom permissions data
  const customPermissionsData = useMemo(() => {
    if (!customConfig) return []
    return buildCustomPermissionsData(customConfig)
  }, [customConfig])

  // Load workspace permissions config
  useEffect(() => {
    const loadPermissions = async () => {
      if (!window.electronAPI || !activeWorkspaceId) {
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const config = await window.electronAPI.getWorkspacePermissionsConfig(activeWorkspaceId)
        setCustomConfig(config)
      } catch (error) {
        console.error('Failed to load workspace permissions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadPermissions()
  }, [activeWorkspaceId])

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title="Permissions" />
      <div className="flex-1 min-h-0 mask-fade-y">
        <ScrollArea className="h-full">
          <div className="px-5 py-7 max-w-3xl mx-auto">
            <div className="space-y-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Default Permissions Section */}
                  <SettingsSection
                    title="Default Allowed Commands"
                    description="Built-in patterns that are always allowed in Explore mode. These cannot be modified."
                  >
                    <SettingsCard className="p-0">
                      <PermissionsDataTable
                        data={defaultPermissionsData}
                        searchable
                        maxHeight={350}
                      />
                    </SettingsCard>
                  </SettingsSection>

                  {/* Custom Permissions Section */}
                  <SettingsSection
                    title="Workspace Customizations"
                    description="Additional patterns from permissions.json. These extend the defaults."
                  >
                    <SettingsCard className="p-0">
                      {customPermissionsData.length > 0 ? (
                        <PermissionsDataTable
                          data={customPermissionsData}
                          searchable
                          maxHeight={350}
                        />
                      ) : (
                        <div className="p-8 text-center text-muted-foreground">
                          <p className="text-sm">No custom permissions configured.</p>
                          <p className="text-xs mt-1 text-foreground/40">
                            Create a <code className="bg-foreground/5 px-1 rounded">permissions.json</code> file in your workspace to add custom rules.
                          </p>
                        </div>
                      )}
                    </SettingsCard>
                  </SettingsSection>
                </>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
