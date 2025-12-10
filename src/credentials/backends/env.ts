/**
 * Environment Variable Backend
 *
 * Read-only backend for server/container deployments.
 * Reads credentials from environment variables.
 *
 * Supported variables:
 *   CRAFT_ANTHROPIC_API_KEY - Anthropic API key
 *   CRAFT_CLAUDE_OAUTH_TOKEN - Claude OAuth token
 *
 * Note: Workspace and agent-scoped credentials are not supported
 * via environment variables - use file backend for those.
 */

import type { CredentialBackend } from './types.ts';
import type { CredentialId, StoredCredential } from '../types.ts';

const ENV_MAP: Record<string, string> = {
  anthropic_api_key: 'CRAFT_ANTHROPIC_API_KEY',
  claude_oauth: 'CRAFT_CLAUDE_OAUTH_TOKEN',
};

export class EnvironmentBackend implements CredentialBackend {
  readonly name = 'environment';
  readonly priority = 110; // Higher than file (100) so env vars override file storage

  async isAvailable(): Promise<boolean> {
    // Always available, but only provides read access to global credentials
    return true;
  }

  async get(id: CredentialId): Promise<StoredCredential | null> {
    // Only support global credentials
    if (id.workspaceId || id.agentId) {
      return null;
    }

    const envVar = ENV_MAP[id.type];
    if (!envVar) {
      return null;
    }

    const value = process.env[envVar];
    if (!value) {
      return null;
    }

    return { value };
  }

  async set(_id: CredentialId, _credential: StoredCredential): Promise<void> {
    // Environment variables are read-only
    throw new Error('Environment backend is read-only');
  }

  async delete(_id: CredentialId): Promise<boolean> {
    // Environment variables are read-only
    return false;
  }

  async list(_filter?: Partial<CredentialId>): Promise<CredentialId[]> {
    const ids: CredentialId[] = [];

    for (const [type, envVar] of Object.entries(ENV_MAP)) {
      if (process.env[envVar]) {
        ids.push({ type: type as CredentialId['type'] });
      }
    }

    return ids;
  }
}
