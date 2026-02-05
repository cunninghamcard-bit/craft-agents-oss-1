/**
 * Onboarding IPC handlers for Electron main process
 *
 * Handles workspace setup and configuration persistence.
 */
import { ipcMain } from 'electron'
import { mainLog } from './logger'
import { getAuthState, getSetupNeeds } from '@craft-agent/shared/auth'
import { getCredentialManager } from '@craft-agent/shared/credentials'
import {
  saveConfig,
  loadStoredConfig,
  generateWorkspaceId,
  type AuthType,
  type StoredConfig,
  type LlmConnection,
} from '@craft-agent/shared/config'
import { getDefaultWorkspacesDir, generateUniqueWorkspacePath } from '@craft-agent/shared/workspaces'
import { CraftOAuth, getMcpBaseUrl } from '@craft-agent/shared/auth'
import { validateMcpConnection } from '@craft-agent/shared/mcp'
import { startClaudeOAuth, exchangeClaudeCode, hasValidOAuthState, clearOAuthState } from '@craft-agent/shared/auth'
import { getCredentialManager as getCredentialManagerFn } from '@craft-agent/shared/credentials'
import {
  IPC_CHANNELS,
  type OnboardingSaveResult,
} from '../shared/types'
import type { SessionManager } from './sessions'

// ============================================
// IPC Handlers
// ============================================

export function registerOnboardingHandlers(sessionManager: SessionManager): void {
  // Get current auth state
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_GET_AUTH_STATE, async () => {
    const authState = await getAuthState()
    const setupNeeds = getSetupNeeds(authState)
    return { authState, setupNeeds }
  })

  // Validate MCP connection
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_VALIDATE_MCP, async (_event, mcpUrl: string, accessToken?: string) => {
    try {
      const result = await validateMcpConnection({
        mcpUrl,
        mcpAccessToken: accessToken,
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: message }
    }
  })

  // Start MCP server OAuth
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_START_MCP_OAUTH, async (_event, mcpUrl: string) => {
    mainLog.info('[Onboarding:Main] ONBOARDING_START_MCP_OAUTH received', { mcpUrl })
    try {
      const baseUrl = getMcpBaseUrl(mcpUrl)
      mainLog.info('[Onboarding:Main] MCP OAuth baseUrl:', baseUrl)
      mainLog.info('[Onboarding:Main] Creating CraftOAuth instance...')

      const oauth = new CraftOAuth(
        { mcpBaseUrl: baseUrl },
        {
          onStatus: (msg) => mainLog.info('[Onboarding:Main] MCP OAuth status:', msg),
          onError: (err) => mainLog.error('[Onboarding:Main] MCP OAuth error:', err),
        }
      )

      mainLog.info('[Onboarding:Main] Calling oauth.authenticate() - this may open browser and wait...')
      const { tokens, clientId } = await oauth.authenticate()
      mainLog.info('[Onboarding:Main] MCP OAuth completed successfully')

      return {
        success: true,
        accessToken: tokens.accessToken,
        clientId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      mainLog.error('[Onboarding:Main] MCP OAuth failed:', message, error)
      return { success: false, error: message }
    }
  })

  // Save onboarding configuration
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_SAVE_CONFIG, async (_event, config: {
    authType?: AuthType  // Optional - if not provided, preserves existing auth type
    workspace?: { name: string; iconUrl?: string; mcpUrl?: string }  // Optional - if not provided, only updates billing
    credential?: string
    mcpCredentials?: { accessToken: string; clientId?: string }
    anthropicBaseUrl?: string | null
    customModel?: string | null
  }): Promise<OnboardingSaveResult> => {
    mainLog.info('[Onboarding:Main] ONBOARDING_SAVE_CONFIG received', {
      authType: config.authType,
      hasWorkspace: !!config.workspace,
      workspaceName: config.workspace?.name,
      mcpUrl: config.workspace?.mcpUrl,
      hasCredential: !!config.credential,
      credentialLength: config.credential?.length,
      hasMcpCredentials: !!config.mcpCredentials,
      anthropicBaseUrl: config.anthropicBaseUrl,
      customModel: config.customModel,
    })

    try {
      const manager = getCredentialManager()

      // 1. Save billing credential if provided (only when authType is specified)
      if (config.credential && config.authType) {
        mainLog.info('[Onboarding:Main] Saving credential for authType:', config.authType)
        if (config.authType === 'api_key') {
          // Save to LLM connection (new system only - legacy migration handles old users)
          await manager.setLlmApiKey('anthropic-api', config.credential)
          mainLog.info('[Onboarding:Main] API key saved to LLM connection')
        } else if (config.authType === 'oauth_token') {
          // OAuth credentials are saved via ONBOARDING_EXCHANGE_CLAUDE_CODE handler
          mainLog.info('[Onboarding:Main] OAuth token auth type - credentials saved via native OAuth flow')
        } else if (config.authType === 'codex_api_key') {
          // Save OpenAI API key for Codex (OpenRouter, Vercel AI Gateway compatible)
          await manager.setLlmApiKey('codex-api', config.credential)
          mainLog.info('[Onboarding:Main] OpenAI API key saved to codex-api LLM connection')
        }
      } else {
        mainLog.info('[Onboarding:Main] Skipping credential save', {
          hasCredential: !!config.credential,
          hasAuthType: !!config.authType,
        })
      }

      // 2. Load or create config
      mainLog.info('[Onboarding:Main] Loading existing config...')
      const existingConfig = loadStoredConfig()
      mainLog.info('[Onboarding:Main] Existing config:', existingConfig ? 'found' : 'not found')

      const newConfig: StoredConfig = existingConfig || {
        authType: config.authType || 'api_key',
        workspaces: [],
        activeWorkspaceId: null,
        activeSessionId: null,
      }

      // 3. Update authType and defaultLlmConnection if provided
      if (config.authType) {
        mainLog.info('[Onboarding:Main] Updating authType from', newConfig.authType, 'to', config.authType)
        // Keep authType for backwards compatibility
        newConfig.authType = config.authType

        // Also set defaultLlmConnection based on authType (new system)
        // This is the authoritative setting going forward
        const connectionSlug = config.authType === 'api_key' ? 'anthropic-api' :
                               config.authType === 'oauth_token' ? 'claude-max' :
                               config.authType === 'codex_oauth' ? 'codex' :
                               config.authType === 'codex_api_key' ? 'codex-api' : null
        if (connectionSlug) {
          // Only set default if none exists (don't override user's existing default)
          if (!newConfig.defaultLlmConnection) {
            mainLog.info('[Onboarding:Main] Setting defaultLlmConnection to', connectionSlug)
            newConfig.defaultLlmConnection = connectionSlug
          }

          // Ensure the LLM connection entry exists (check newConfig, not disk)
          const connectionExists = newConfig.llmConnections?.some(c => c.slug === connectionSlug)
          if (!connectionExists) {
            mainLog.info('[Onboarding:Main] Creating LLM connection:', connectionSlug)

            // Build connection config based on authType
            let connection: LlmConnection | null = null
            const hasCustomEndpoint = !!config.anthropicBaseUrl

            // Note: models are NOT included for built-in providers (anthropic, openai).
            // The centralized MODEL_REGISTRY is the source of truth.
            // Only *_compat providers need models specified in config.
            if (config.authType === 'api_key') {
              connection = {
                slug: 'anthropic-api',
                name: hasCustomEndpoint ? 'Custom Anthropic-Compatible' : 'Anthropic (API Key)',
                providerType: hasCustomEndpoint ? 'anthropic_compat' : 'anthropic',
                authType: hasCustomEndpoint ? 'api_key_with_endpoint' : 'api_key',
                createdAt: Date.now(),
              }
            } else if (config.authType === 'oauth_token') {
              connection = {
                slug: 'claude-max',
                name: 'Claude Max',
                providerType: 'anthropic',
                authType: 'oauth',
                createdAt: Date.now(),
              }
            } else if (config.authType === 'codex_oauth') {
              connection = {
                slug: 'codex',
                name: 'Codex (ChatGPT Plus)',
                providerType: 'openai',
                authType: 'oauth',
                createdAt: Date.now(),
              }
            } else if (config.authType === 'codex_api_key') {
              connection = {
                slug: 'codex-api',
                name: hasCustomEndpoint ? 'Codex (Custom Endpoint)' : 'Codex (OpenAI API Key)',
                providerType: 'openai',
                authType: hasCustomEndpoint ? 'api_key_with_endpoint' : 'api_key',
                createdAt: Date.now(),
              }
            }

            if (connection) {
              // Apply baseUrl if set
              if (config.anthropicBaseUrl) {
                connection.baseUrl = config.anthropicBaseUrl
              }
              // Apply customModel if set
              if (config.customModel) {
                connection.defaultModel = config.customModel
              }

              // Add connection directly to newConfig (not via addLlmConnection which
              // would save separately and then get overwritten by saveConfig(newConfig))
              if (!newConfig.llmConnections) {
                newConfig.llmConnections = []
              }
              newConfig.llmConnections.push(connection)
              mainLog.info('[Onboarding:Main] Created LLM connection:', connection.slug)
            }
          }
        }
      }

      // 3a. Update anthropicBaseUrl if provided
      if (config.anthropicBaseUrl !== undefined) {
        mainLog.info('[Onboarding:Main] Updating anthropicBaseUrl to', config.anthropicBaseUrl)
        if (config.anthropicBaseUrl) {
          newConfig.anthropicBaseUrl = config.anthropicBaseUrl
        } else {
          delete newConfig.anthropicBaseUrl
        }
      }

      // 3b. Update customModel if provided
      if (config.customModel !== undefined) {
        mainLog.info('[Onboarding:Main] Updating customModel to', config.customModel)
        if (config.customModel?.trim()) {
          newConfig.customModel = config.customModel.trim()
        } else {
          delete newConfig.customModel
        }
      }

      // 4. Create workspace only if workspace info is provided
      let workspaceId: string | undefined
      if (config.workspace) {
        // Check if workspace with same name already exists
        const existingIndex = newConfig.workspaces.findIndex(w => w.name.toLowerCase() === config.workspace!.name.toLowerCase())
        const existingWorkspace = existingIndex !== -1 ? newConfig.workspaces[existingIndex] : null

        // Use existing ID if updating, otherwise generate new one
        workspaceId = existingWorkspace?.id ?? generateWorkspaceId()
        mainLog.info('[Onboarding:Main] Creating workspace:', workspaceId)

        const workspace = {
          id: workspaceId,
          name: config.workspace.name,
          rootPath: existingWorkspace?.rootPath ?? generateUniqueWorkspacePath(config.workspace.name, getDefaultWorkspacesDir()),
          createdAt: existingWorkspace?.createdAt ?? Date.now(), // Preserve original creation time
          iconUrl: config.workspace.iconUrl,
          mcpUrl: config.workspace.mcpUrl,
        }
        mainLog.info('[Onboarding:Main] Workspace config:', workspace, existingWorkspace ? '(updating existing)' : '(new)')

        // Save MCP credentials if provided
        if (config.mcpCredentials) {
          mainLog.info('[Onboarding:Main] Saving MCP credentials for workspace')
          await manager.setWorkspaceOAuth(workspaceId, {
            accessToken: config.mcpCredentials.accessToken,
            tokenType: 'Bearer',
            clientId: config.mcpCredentials.clientId,
          })
          mainLog.info('[Onboarding:Main] MCP credentials saved')
        }

        if (existingIndex !== -1) {
          // Update existing workspace
          newConfig.workspaces[existingIndex] = workspace
        } else {
          // Add new workspace
          newConfig.workspaces.push(workspace)
        }
        newConfig.activeWorkspaceId = workspaceId
      } else {
        mainLog.info('[Onboarding:Main] No workspace to create (billing-only update)')

        // 4b. Auto-create default workspace if no workspaces exist
        // This ensures users have a workspace to start with after billing-only onboarding
        if (newConfig.workspaces.length === 0) {
          workspaceId = generateWorkspaceId()
          mainLog.info('[Onboarding:Main] Auto-creating default workspace:', workspaceId)

          const defaultWorkspace = {
            id: workspaceId,
            name: 'My Workspace',
            rootPath: generateUniqueWorkspacePath('My Workspace', getDefaultWorkspacesDir()),
            createdAt: Date.now(),
          }
          newConfig.workspaces.push(defaultWorkspace)
          newConfig.activeWorkspaceId = workspaceId
        }
      }

      // 5. Save config
      mainLog.info('[Onboarding:Main] Saving config to disk...')
      saveConfig(newConfig)
      mainLog.info('[Onboarding:Main] Config saved successfully')

      // 6. Reinitialize SessionManager auth to pick up new credentials
      try {
        mainLog.info('[Onboarding:Main] Reinitializing SessionManager auth...')
        await sessionManager.reinitializeAuth()
        mainLog.info('[Onboarding:Main] Reinitialized auth after config save')
      } catch (authError) {
        mainLog.error('[Onboarding:Main] Failed to reinitialize auth:', authError)
        // Don't fail the whole operation if auth reinit fails
      }

      mainLog.info('[Onboarding:Main] Returning success', { workspaceId })
      return {
        success: true,
        workspaceId,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      mainLog.error('[Onboarding:Main] Save config error:', message, error)
      return { success: false, error: message }
    }
  })

  // Start Claude OAuth flow (opens browser, returns URL)
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_START_CLAUDE_OAUTH, async () => {
    try {
      mainLog.info('[Onboarding] Starting Claude OAuth flow...')

      const authUrl = await startClaudeOAuth((status) => {
        mainLog.info('[Onboarding] Claude OAuth status:', status)
      })

      mainLog.info('[Onboarding] Claude OAuth URL generated, browser opened')
      return { success: true, authUrl }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      mainLog.error('[Onboarding] Start Claude OAuth error:', message)
      return { success: false, error: message }
    }
  })

  // Exchange authorization code for tokens
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_EXCHANGE_CLAUDE_CODE, async (_event, authorizationCode: string) => {
    try {
      mainLog.info('[Onboarding] Exchanging Claude authorization code...')

      // Check if we have valid state
      if (!hasValidOAuthState()) {
        mainLog.error('[Onboarding] No valid OAuth state found')
        return { success: false, error: 'OAuth session expired. Please start again.' }
      }

      const tokens = await exchangeClaudeCode(authorizationCode, (status) => {
        mainLog.info('[Onboarding] Claude code exchange status:', status)
      })

      // Save credentials with refresh token support
      const manager = getCredentialManagerFn()

      // Save to LLM connection (new system only - legacy migration handles old users)
      await manager.setLlmOAuth('claude-max', {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      })

      const expiresAtDate = tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : 'never'
      mainLog.info(`[Onboarding] Claude OAuth saved to LLM connection (expires: ${expiresAtDate})`)
      return { success: true, token: tokens.accessToken }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      mainLog.error('[Onboarding] Exchange Claude code error:', message)
      return { success: false, error: message }
    }
  })

  // Check if there's a valid OAuth state in progress
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_HAS_CLAUDE_OAUTH_STATE, async () => {
    return hasValidOAuthState()
  })

  // Clear OAuth state (for cancel/reset)
  ipcMain.handle(IPC_CHANNELS.ONBOARDING_CLEAR_CLAUDE_OAUTH_STATE, async () => {
    clearOAuthState()
    return { success: true }
  })
}
