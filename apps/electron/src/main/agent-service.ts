/**
 * Agent discovery service for Electron app
 * Uses SubAgentManager from core to discover and manage agents
 */

import { getWorkspaceByNameOrId, loadStoredConfig, type Workspace } from '../../../../src/config/storage'
import { getCredentialManager } from '../../../../src/credentials'
import { CraftMcpClient } from '../../../../src/mcp/client'
import { SubAgentManager, type SubAgentManagerConfig } from '../../../../src/agents/manager'
import type { SubAgentMetadata } from '../../../../src/agents/types'

/**
 * Cached agent manager per workspace
 */
interface CachedAgentManager {
  manager: SubAgentManager
  lastAccess: number
}

export class AgentService {
  private managerCache: Map<string, CachedAgentManager> = new Map()

  /**
   * Get or create a SubAgentManager for a workspace
   */
  private async getManager(workspaceId: string): Promise<SubAgentManager> {
    // Check cache
    const cached = this.managerCache.get(workspaceId)
    if (cached) {
      cached.lastAccess = Date.now()
      return cached.manager
    }

    // Get workspace
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`)
    }

    // Get access token for MCP based on auth type
    const credManager = getCredentialManager()
    await credManager.initialize()

    let token: string | undefined
    const mcpAuthType = workspace.mcpAuthType || 'workspace_oauth'

    if (mcpAuthType === 'workspace_oauth') {
      const oauth = await credManager.getWorkspaceOAuth(workspaceId)
      token = oauth?.accessToken
    } else if (mcpAuthType === 'workspace_bearer') {
      token = await credManager.getWorkspaceBearer(workspaceId) || undefined
    }
    // 'public' type doesn't need a token

    // Create MCP client with appropriate headers
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    const mcpClient = new CraftMcpClient({
      url: workspace.mcpUrl,
      headers: Object.keys(headers).length > 0 ? headers : undefined
    })
    await mcpClient.connect()

    // Create manager config
    const config = loadStoredConfig()
    const managerConfig: SubAgentManagerConfig = {
      model: config?.model || 'claude-sonnet-4-5-20250929',
      mcpUrl: workspace.mcpUrl,
      mcpToken: token,
    }

    // Create and cache manager
    const manager = new SubAgentManager(workspaceId, mcpClient, managerConfig)
    this.managerCache.set(workspaceId, {
      manager,
      lastAccess: Date.now()
    })

    return manager
  }

  /**
   * Discover agents for a workspace
   * Returns cached list if available, otherwise discovers fresh
   */
  async getAgents(workspaceId: string): Promise<SubAgentMetadata[]> {
    try {
      const manager = await this.getManager(workspaceId)
      return await manager.getAvailableAgents()
    } catch (error) {
      console.error('[AgentService] Error discovering agents:', error)
      return []
    }
  }

  /**
   * Force refresh agent discovery for a workspace
   */
  async refreshAgents(workspaceId: string): Promise<SubAgentMetadata[]> {
    try {
      const manager = await this.getManager(workspaceId)
      return await manager.refreshAgents()
    } catch (error) {
      console.error('[AgentService] Error refreshing agents:', error)
      return []
    }
  }

  /**
   * Clear cached manager for a workspace (e.g., on workspace switch)
   */
  clearCache(workspaceId: string): void {
    this.managerCache.delete(workspaceId)
  }

  /**
   * Clear all cached managers
   */
  clearAllCaches(): void {
    this.managerCache.clear()
  }
}

// Singleton instance
export const agentService = new AgentService()
