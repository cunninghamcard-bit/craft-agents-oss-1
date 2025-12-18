/**
 * AgentInfoTabPanel
 *
 * Displays agent details including capabilities, MCP servers, and APIs.
 * Content extracted from AgentInfoDialog.
 */

import * as React from 'react'
import { useEffect, useState } from 'react'
import { Wrench, AlertCircle, CheckCircle2, ChevronRight, Lock } from 'lucide-react'
import { McpIcon } from '@/components/icons/McpIcon'
import { Spinner } from '@/components/ui/loading-indicator'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type {
  SubAgentDefinition,
  AgentAuthStatus,
} from '../../../shared/types'
import type { Tab, AgentInfoTab } from '../types'

interface AgentInfoTabPanelProps {
  tab: Tab
}

export default function AgentInfoTabPanel({ tab }: AgentInfoTabPanelProps) {
  const agentInfoTab = tab as AgentInfoTab
  const { agentId, workspaceId } = agentInfoTab

  const [definition, setDefinition] = useState<SubAgentDefinition | null>(null)
  const [authStatus, setAuthStatus] = useState<AgentAuthStatus | null>(null)
  const [definitionLoading, setDefinitionLoading] = useState(true)
  const [toolsLoading, setToolsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch definition and auth status on mount
  // Definition loads first to show content immediately, auth status loads tools
  useEffect(() => {
    let isMounted = true
    setDefinitionLoading(true)
    setToolsLoading(true)
    setError(null)

    // Fetch definition first (shows content immediately)
    window.electronAPI.getAgentDefinition(workspaceId, agentId)
      .then((def) => {
        if (!isMounted) return
        setDefinition(def)
        setDefinitionLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err.message || 'Failed to load agent definition')
        setDefinitionLoading(false)
      })

    // Fetch auth status (includes MCP server tools)
    window.electronAPI.getAgentAuthStatus(workspaceId, agentId)
      .then((auth) => {
        if (!isMounted) return
        setAuthStatus(auth)
        setToolsLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setToolsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [workspaceId, agentId])

  return (
    <ScrollArea className="h-full">
      <div className="px-8 p-6  mx-auto">
        {/* Agent name as title */}
        <h2 className="text-lg font-semibold mb-4">{agentInfoTab.label}</h2>

        {definitionLoading && (
          <div className="flex items-center justify-center py-8">
            <Spinner className="text-lg text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {definition && !definitionLoading && (
          <div className="space-y-4">
            {/* Capabilities */}
            {definition.capabilities && definition.capabilities.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Capabilities</h4>
                <ul className="text-sm space-y-1.5 list-disc pl-5">
                  {definition.capabilities.map((cap, i) => (
                    <li key={i}>{cap}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Info Messages */}
            {definition.info && definition.info.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Info</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {definition.info.map((msg, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-500 shrink-0">i</span>
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Separator />

            {/* MCP Servers */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <McpIcon className="h-4 w-4" />
                MCP Servers
              </h4>
              {definition?.mcpServers && definition.mcpServers.length > 0 ? (
                <ul className="text-sm space-y-2">
                  {definition.mcpServers.map((server, i) => {
                    // Find matching server from authStatus for tools and auth info
                    const authServer = authStatus?.mcpServers?.find(s => s.name === server.name)
                    const tools = authServer?.tools
                    const hasAuthInfo = authServer !== undefined

                    return (
                      <li key={i} className="bg-muted/50 rounded-md px-4 py-3 select-none">
                        <div className="font-medium">{server.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {server.url}
                        </div>
                        {/* Tools section - show loading or tools */}
                        {toolsLoading ? (
                          <div className="flex items-center gap-1.5 mt-2 mb-3 text-xs text-muted-foreground">
                            <Spinner className="text-xs" />
                            <span>Loading tools...</span>
                          </div>
                        ) : tools && tools.length > 0 ? (
                          <Collapsible className="mt-2 mb-3">
                            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                              <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
                              <span>{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2">
                              <div className="flex flex-wrap gap-1.5">
                                {tools.map((tool, j) => (
                                  <Badge
                                    key={j}
                                    variant="secondary"
                                    className="text-xs font-mono font-normal bg-foreground/5"
                                  >
                                    {tool}
                                  </Badge>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ) : null}
                        {/* Auth status - show from authServer if available, else from definition */}
                        {(hasAuthInfo ? authServer?.requiresAuth : server.requiresAuth) && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="outline" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />
                              Requires Auth
                            </Badge>
                            {hasAuthInfo ? (
                              authServer?.hasAuth ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-green-500/30 text-green-600 dark:text-green-400"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Authenticated
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-amber-500/30 text-amber-600 dark:text-amber-400"
                                >
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Not authenticated
                                </Badge>
                              )
                            ) : null}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No MCP servers configured
                </p>
              )}
            </div>

            {/* APIs */}
            {(authStatus?.apis?.length || definition?.apis?.length) && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    REST APIs
                  </h4>
                  {authStatus?.apis && authStatus.apis.length > 0 ? (
                    <ul className="text-sm space-y-2">
                      {authStatus.apis.map((api, i) => (
                        <li key={i} className="bg-muted/50 rounded-md p-2">
                          <div className="font-medium">{api.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {api.baseUrl}
                          </div>
                          {api.auth && api.auth.type !== 'none' && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Badge variant="outline" className="text-xs">
                                Auth: {api.auth.type}
                              </Badge>
                              {api.hasAuth ? (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-green-500/30 text-green-600 dark:text-green-400"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Configured
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-amber-500/30 text-amber-600 dark:text-amber-400"
                                >
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Not configured
                                </Badge>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : definition?.apis && definition.apis.length > 0 ? (
                    <ul className="text-sm space-y-2">
                      {definition.apis.map((api, i) => (
                        <li key={i} className="bg-muted/50 rounded-md p-2">
                          <div className="font-medium">{api.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {api.baseUrl}
                          </div>
                          {api.auth && api.auth.type !== 'none' && (
                            <Badge variant="outline" className="text-xs mt-1">
                              Auth: {api.auth.type}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}

        {!definition && !definitionLoading && !error && (
          <p className="text-sm text-muted-foreground py-4">
            No definition available. This agent may need to be activated first.
          </p>
        )}
      </div>
    </ScrollArea>
  )
}
