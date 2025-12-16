/**
 * Workspace and authentication types
 */

/**
 * How the workspace's MCP server should be authenticated.
 * - 'workspace_oauth': Has OAuth credentials (workspace_oauth::{workspaceId})
 * - 'workspace_bearer': Uses bearer token (workspace_bearer::{workspaceId})
 * - 'public': Truly public, no auth needed
 *
 * Note: Craft OAuth (craft_oauth::global) is ONLY for Craft API (spaces, MCP link management).
 * It should NEVER be used for MCP server authentication - MCP servers have their own OAuth.
 */
export type McpAuthType = 'workspace_oauth' | 'workspace_bearer' | 'public';

export interface Workspace {
  id: string;
  name: string;
  mcpUrl: string;
  mcpAuthType?: McpAuthType;  // Explicit MCP auth type (defaults to workspace_oauth)
  isPublic?: boolean;         // DEPRECATED: Use mcpAuthType instead
  createdAt: number;
  sessionId?: string;  // SDK session ID for conversation continuity
}

export type AuthType = 'api_key' | 'oauth_token' | 'craft_credits';

/**
 * OAuth credentials from a fresh authentication flow.
 * Used for temporary state in UI components before saving to credential store.
 */
export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId: string;
  tokenType: string;
}

// Token display mode for status bar
export type TokenDisplayMode = 'hidden' | 'total' | 'separate';

// Global cumulative usage tracking across all workspaces
export interface CumulativeUsage {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUpdated: number;
}

// Config stored in JSON file (credentials stored in encrypted file, not here)
export interface StoredConfig {
  authType?: AuthType;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeSessionId: string | null;  // Currently active session (primary scope)
  model?: string;
  extendedCacheTtl?: boolean;  // Extended cache TTL: true=1h all, false=5m all, undefined=auto (Opus only)
  tokenDisplay?: TokenDisplayMode;  // How to show tokens in status bar
  showCost?: boolean;  // Whether to show cost in status bar
  cumulativeUsage?: CumulativeUsage;  // Global cumulative cost
}

/**
 * Auth status for a workspace's MCP connection.
 * Used by UI to show appropriate feedback when auth is missing.
 */
export interface WorkspaceAuthStatus {
  authType: McpAuthType;
  hasToken: boolean;
  needsAuth: boolean;
  message?: string;
}
