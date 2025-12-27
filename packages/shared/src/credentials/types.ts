/**
 * Credential Storage Types
 *
 * Defines the types for secure credential storage using AES-256-GCM encryption.
 * Supports global, workspace-scoped, source-scoped, and agent-scoped credentials.
 *
 * Credential key naming (workspace-scoped):
 *   Format: "{type}::{scope...}"
 *
 * Examples:
 *   - anthropic_api_key::global
 *   - claude_oauth::global
 *   - craft_oauth::global (for Craft API, not MCP)
 *   - source_oauth::{workspaceSlug}::{sourceSlug}
 *   - source_bearer::{workspaceSlug}::{sourceSlug}
 *   - agent_source_oauth::{workspaceSlug}::{agentSlug}::{sourceSlug}
 *
 * Note: Using "::" as delimiter to avoid conflicts with "/" in URLs or paths.
 */

/** Types of credentials we store */
export type CredentialType =
  | 'anthropic_api_key'
  | 'claude_oauth'
  | 'craft_oauth'
  | 'workspace_oauth'
  | 'workspace_bearer'
  | 'mcp_oauth'
  | 'api_key'
  // Global sources (stored at ~/.craft-agent/sources/{slug}/)
  | 'source_oauth'       // OAuth tokens for MCP/API sources
  | 'source_bearer'      // Bearer tokens
  | 'source_apikey'      // API keys
  | 'source_basic'       // Basic auth (base64 encoded user:pass)
  // Agent-scoped sources (stored at ~/.craft-agent/agents/{agentSlug}/sources/{slug}/)
  | 'agent_source_oauth'
  | 'agent_source_bearer'
  | 'agent_source_apikey'
  | 'agent_source_basic'
  // Agent-managed secrets (via session tools)
  | 'agent_secret';

/** Valid credential types for validation */
const VALID_CREDENTIAL_TYPES: readonly CredentialType[] = [
  'anthropic_api_key',
  'claude_oauth',
  'craft_oauth',
  'workspace_oauth',
  'workspace_bearer',
  'mcp_oauth',
  'api_key',
  // Source credentials
  'source_oauth',
  'source_bearer',
  'source_apikey',
  'source_basic',
  // Agent-scoped source credentials
  'agent_source_oauth',
  'agent_source_bearer',
  'agent_source_apikey',
  'agent_source_basic',
  // Agent-managed secrets
  'agent_secret',
] as const;

/** Check if a string is a valid CredentialType */
function isValidCredentialType(type: string): type is CredentialType {
  return VALID_CREDENTIAL_TYPES.includes(type as CredentialType);
}

/** Credential identifier - determines credential store entry key */
export interface CredentialId {
  type: CredentialType;

  // Workspace-scoped format
  /** Workspace slug for workspace-scoped credentials */
  workspaceSlug?: string;
  /** Source slug for source credentials */
  sourceSlug?: string;
  /** Agent slug for agent-scoped source credentials */
  agentSlug?: string;
  /** Server name or API name */
  name?: string;

  // Legacy fields (kept for backwards compatibility with old MCP/API credentials)
  /** @deprecated Use workspaceSlug instead */
  workspaceId?: string;
  /** @deprecated For agent-scoped credentials (subagent MCP/API) */
  agentId?: string;
}

/**
 * Stored credential value in encrypted file.
 *
 * This is a generic type for all credential types (OAuth, bearer tokens, API keys).
 * All fields except `value` are optional since not all credential types use them.
 *
 * Note: `clientId` is optional here unlike `OAuthCredentials` (in storage.ts)
 * where it's required, because this type also covers bearer tokens and API keys
 * which don't have a clientId.
 */
export interface StoredCredential {
  /** The secret value (API key or access token) */
  value: string;
  /** OAuth refresh token */
  refreshToken?: string;
  /** OAuth token expiration (Unix timestamp ms) */
  expiresAt?: number;
  /** OAuth client ID (needed for token refresh) */
  clientId?: string;
  /** Token type (e.g., "Bearer") */
  tokenType?: string;
}

// Using "::" as delimiter instead of "/" because server names and API names
// could contain "/" (e.g., URLs like "https://api.example.com")
const CREDENTIAL_DELIMITER = '::';

/** Source credential types */
const SOURCE_CREDENTIAL_TYPES = [
  'source_oauth',
  'source_bearer',
  'source_apikey',
  'source_basic',
] as const;

/** Agent-scoped source credential types */
const AGENT_SOURCE_CREDENTIAL_TYPES = [
  'agent_source_oauth',
  'agent_source_bearer',
  'agent_source_apikey',
  'agent_source_basic',
] as const;

/** Check if type is a source credential */
function isSourceCredential(type: CredentialType): boolean {
  return (SOURCE_CREDENTIAL_TYPES as readonly string[]).includes(type);
}

/** Check if type is an agent-scoped source credential */
function isAgentSourceCredential(type: CredentialType): boolean {
  return (AGENT_SOURCE_CREDENTIAL_TYPES as readonly string[]).includes(type);
}

/** Convert CredentialId to credential store account string */
export function credentialIdToAccount(id: CredentialId): string {
  const parts: string[] = [id.type];

  // New workspace-scoped format:
  // Source credentials: source_oauth::{workspaceSlug}::{sourceSlug}
  if (isSourceCredential(id.type) && id.workspaceSlug && id.sourceSlug) {
    parts.push(id.workspaceSlug);
    parts.push(id.sourceSlug);
    return parts.join(CREDENTIAL_DELIMITER);
  }

  // Agent-scoped source credentials: agent_source_oauth::{workspaceSlug}::{agentSlug}::{sourceSlug}
  if (isAgentSourceCredential(id.type) && id.workspaceSlug && id.agentSlug && id.sourceSlug) {
    parts.push(id.workspaceSlug);
    parts.push(id.agentSlug);
    parts.push(id.sourceSlug);
    return parts.join(CREDENTIAL_DELIMITER);
  }

  // Legacy: Source credentials without workspace: source_oauth::{sourceSlug}
  if (isSourceCredential(id.type) && id.sourceSlug && !id.workspaceSlug) {
    parts.push(id.sourceSlug);
    return parts.join(CREDENTIAL_DELIMITER);
  }

  // Legacy: Agent-scoped source credentials without workspace: agent_source_oauth::{agentSlug}::{sourceSlug}
  if (isAgentSourceCredential(id.type) && id.agentSlug && id.sourceSlug && !id.workspaceSlug) {
    parts.push(id.agentSlug);
    parts.push(id.sourceSlug);
    return parts.join(CREDENTIAL_DELIMITER);
  }

  // Agent secrets: agent_secret::{name}
  if (id.type === 'agent_secret' && id.name) {
    parts.push(id.name);
    return parts.join(CREDENTIAL_DELIMITER);
  }

  // Legacy workspace ID-based credentials
  if (id.workspaceId) {
    parts.push(id.workspaceId);
    if (id.agentId) {
      parts.push(id.agentId);
      if (id.name) {
        parts.push(id.name);
      }
    }
  } else {
    parts.push('global');
  }

  return parts.join(CREDENTIAL_DELIMITER);
}

/** Parse credential store account string back to CredentialId. Returns null if invalid. */
export function accountToCredentialId(account: string): CredentialId | null {
  const parts = account.split(CREDENTIAL_DELIMITER);
  const typeStr = parts[0];

  // Validate the type
  if (!typeStr || !isValidCredentialType(typeStr)) {
    return null;
  }

  const type = typeStr;

  // New workspace-scoped format:
  // Source credentials: source_oauth::{workspaceSlug}::{sourceSlug}
  if (isSourceCredential(type) && parts.length === 3) {
    return { type, workspaceSlug: parts[1], sourceSlug: parts[2] };
  }

  // Agent-scoped source credentials: agent_source_oauth::{workspaceSlug}::{agentSlug}::{sourceSlug}
  if (isAgentSourceCredential(type) && parts.length === 4) {
    return { type, workspaceSlug: parts[1], agentSlug: parts[2], sourceSlug: parts[3] };
  }

  // Legacy: Source credentials without workspace: source_oauth::{sourceSlug}
  if (isSourceCredential(type) && parts.length === 2) {
    return { type, sourceSlug: parts[1] };
  }

  // Legacy: Agent-scoped source credentials without workspace: agent_source_oauth::{agentSlug}::{sourceSlug}
  if (isAgentSourceCredential(type) && parts.length === 3) {
    return { type, agentSlug: parts[1], sourceSlug: parts[2] };
  }

  // Agent secrets: agent_secret::{name}
  if (type === 'agent_secret' && parts.length === 2) {
    return { type, name: parts[1] };
  }

  if (parts.length === 2 && parts[1] === 'global') {
    return { type };
  }

  // Legacy workspace ID-based: type/workspaceId
  if (parts.length === 2) {
    return { type, workspaceId: parts[1] };
  }

  // Legacy agent-scoped: type/workspaceId/agentId or type/workspaceId/agentId/name
  const id: CredentialId = { type, workspaceId: parts[1], agentId: parts[2] };

  if (parts[3]) {
    id.name = parts[3];
  }

  return id;
}
