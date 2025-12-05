/**
 * Agent caching layer
 *
 * Caches agent definitions and registry locally for performance.
 * Cache structure:
 * ~/.craft-agent/agents/{workspaceId}/
 * ├── registry.json           # List of agent metadata
 * ├── {agentId}/
 * │   ├── definition.json     # Cached agent definition
 * │   └── mcp-auth.json       # MCP server credentials
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type {
  SubAgentMetadata,
  SubAgentDefinition,
  CachedSubAgent,
  AgentRegistry,
  AgentMcpCredentials,
} from './types.ts';
import { debug } from '../tui/utils/debug.ts';

const CONFIG_DIR = join(homedir(), '.craft-agent');
const AGENTS_DIR = join(CONFIG_DIR, 'agents');

/** Cache TTL for agent definitions (30 days) */
const DEFINITION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ensure agents directory exists for a workspace
 */
function ensureAgentDir(workspaceId: string, agentId?: string): string {
  let dir = join(AGENTS_DIR, workspaceId);
  if (agentId) {
    dir = join(dir, agentId);
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ============================================================
// Registry Cache
// ============================================================

/**
 * Get path to registry file
 */
function getRegistryPath(workspaceId: string): string {
  return join(AGENTS_DIR, workspaceId, 'registry.json');
}

/**
 * Load cached agent registry
 */
export function loadRegistry(workspaceId: string): AgentRegistry | null {
  const path = getRegistryPath(workspaceId);
  const exists = existsSync(path);
  debug('[cache] loadRegistry:', workspaceId, exists ? 'found' : 'not found');

  if (!exists) {
    return null;
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const registry = JSON.parse(raw) as AgentRegistry;
    debug('[cache] loadRegistry: loaded', registry.agents.length, 'agents');
    // Cache persists until explicit refresh via /agent refresh
    return registry;
  } catch (err) {
    debug('[cache] loadRegistry: parse error', err);
    return null;
  }
}

/**
 * Save agent registry to cache
 */
export function saveRegistry(workspaceId: string, registry: AgentRegistry): void {
  debug('[cache] saveRegistry:', workspaceId, 'agents:', registry.agents.length);
  ensureAgentDir(workspaceId);
  const path = getRegistryPath(workspaceId);
  writeFileSync(path, JSON.stringify(registry, null, 2));
}

/**
 * Clear registry cache for a workspace
 */
export function clearRegistry(workspaceId: string): void {
  const path = getRegistryPath(workspaceId);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

// ============================================================
// Definition Cache
// ============================================================

/**
 * Get path to agent definition file
 */
function getDefinitionPath(workspaceId: string, agentId: string): string {
  return join(AGENTS_DIR, workspaceId, agentId, 'definition.json');
}

/**
 * Load cached agent definition
 */
export function loadDefinition(workspaceId: string, agentId: string): CachedSubAgent | null {
  const path = getDefinitionPath(workspaceId, agentId);
  const exists = existsSync(path);
  debug('[cache] loadDefinition:', agentId, exists ? 'file found' : 'file not found');

  if (!exists) {
    return null;
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const cached = JSON.parse(raw) as CachedSubAgent;

    // Check if cache is stale
    const isExpired = Date.now() > cached.cacheExpiry;
    const ttlRemaining = Math.round((cached.cacheExpiry - Date.now()) / 1000);
    debug('[cache] loadDefinition:', agentId, isExpired ? 'EXPIRED' : `valid (${ttlRemaining}s remaining)`);

    if (isExpired) {
      return null;
    }

    debug('[cache] loadDefinition: HIT - instructions:', cached.definition?.instructions?.length || 0, 'chars');
    return cached;
  } catch (err) {
    debug('[cache] loadDefinition: parse error', err);
    return null;
  }
}

/**
 * Save agent definition to cache
 */
export function saveDefinition(
  workspaceId: string,
  metadata: SubAgentMetadata,
  definition: SubAgentDefinition,
): void {
  debug('[cache] saveDefinition:', metadata.id, 'TTL:', DEFINITION_CACHE_TTL_MS / 1000, 'seconds');
  debug('[cache] saveDefinition: instructions:', definition.instructions?.length || 0, 'chars, mcpServers:', definition.mcpServers?.length || 0);
  ensureAgentDir(workspaceId, metadata.id);
  const path = getDefinitionPath(workspaceId, metadata.id);

  const cached: CachedSubAgent = {
    metadata,
    definition,
    cacheExpiry: Date.now() + DEFINITION_CACHE_TTL_MS,
  };

  writeFileSync(path, JSON.stringify(cached, null, 2));
}

/**
 * Clear definition cache for an agent
 */
export function clearDefinition(workspaceId: string, agentId: string): void {
  const path = getDefinitionPath(workspaceId, agentId);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

/**
 * Invalidate definition cache (e.g., after self-modification)
 */
export function invalidateDefinition(workspaceId: string, agentId: string): void {
  debug('[cache] invalidateDefinition:', agentId);
  clearDefinition(workspaceId, agentId);
}

// ============================================================
// MCP Credentials Cache
// ============================================================

/**
 * Get path to MCP credentials file
 */
function getMcpAuthPath(workspaceId: string, agentId: string): string {
  return join(AGENTS_DIR, workspaceId, agentId, 'mcp-auth.json');
}

/**
 * Load MCP credentials for an agent
 */
export function loadMcpCredentials(workspaceId: string, agentId: string): AgentMcpCredentials | null {
  const path = getMcpAuthPath(workspaceId, agentId);
  if (!existsSync(path)) {
    return null;
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as AgentMcpCredentials;
  } catch {
    return null;
  }
}

/**
 * Clear MCP credentials for an agent
 */
export function clearMcpCredentials(workspaceId: string, agentId: string): void {
  const path = getMcpAuthPath(workspaceId, agentId);
  if (existsSync(path)) {
    unlinkSync(path);
    debug('[cache] clearMcpCredentials:', agentId);
  }
}

/**
 * Save MCP credentials for an agent
 */
export function saveMcpCredentials(
  workspaceId: string,
  agentId: string,
  credentials: AgentMcpCredentials,
): void {
  ensureAgentDir(workspaceId, agentId);
  const path = getMcpAuthPath(workspaceId, agentId);
  writeFileSync(path, JSON.stringify(credentials, null, 2));
}

/**
 * Get specific server credentials
 */
export function getServerCredentials(
  workspaceId: string,
  agentId: string,
  serverName: string,
): { accessToken: string; refreshToken?: string; expiresAt?: number; clientId?: string } | null {
  const creds = loadMcpCredentials(workspaceId, agentId);
  return creds?.servers[serverName] || null;
}

/**
 * Save credentials for a specific server
 */
export function saveServerCredentials(
  workspaceId: string,
  agentId: string,
  serverName: string,
  credentials: { accessToken: string; refreshToken?: string; expiresAt?: number; clientId?: string },
): void {
  const existing = loadMcpCredentials(workspaceId, agentId) || {
    agentId,
    servers: {},
  };

  existing.servers[serverName] = credentials;
  saveMcpCredentials(workspaceId, agentId, existing);
}

/**
 * Check if server credentials are expired
 */
export function isCredentialExpired(
  workspaceId: string,
  agentId: string,
  serverName: string,
): boolean {
  const cred = getServerCredentials(workspaceId, agentId, serverName);
  if (!cred) return true;
  if (!cred.expiresAt) return false;
  // Consider expired if within 5 minutes of expiry
  return Date.now() > cred.expiresAt - 5 * 60 * 1000;
}
