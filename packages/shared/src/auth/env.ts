/**
 * Auth environment variable management
 *
 * Centralizes the pattern of setting/clearing environment variables
 * when switching between authentication modes.
 */

import type { AuthType } from '../config/storage.ts';

export interface ApiKeyCredentials {
  apiKey: string;
}

export interface ClaudeMaxCredentials {
  oauthToken: string;
}

export interface CraftCreditsCredentials {
  gatewayToken: string;
}

export type AuthCredentials =
  | { type: 'api_key'; credentials: ApiKeyCredentials }
  | { type: 'oauth_token'; credentials: ClaudeMaxCredentials }
  | { type: 'craft_credits'; credentials: CraftCreditsCredentials };

/**
 * Set environment variables for the specified auth type.
 *
 * This clears conflicting env vars and sets the appropriate ones
 * for the selected authentication mode.
 *
 * @param auth - The auth type and credentials to configure
 */
export function setAuthEnvironment(auth: AuthCredentials): void {
  // Clear all auth-related env vars first
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.USE_CRAFT_AI_GATEWAY;
  delete process.env.CRAFT_API_GATEWAY_TOKEN;

  switch (auth.type) {
    case 'api_key':
      process.env.ANTHROPIC_API_KEY = auth.credentials.apiKey;
      break;

    case 'oauth_token':
      process.env.CLAUDE_CODE_OAUTH_TOKEN = auth.credentials.oauthToken;
      break;

    case 'craft_credits':
      // Craft Credits uses a placeholder API key with gateway routing
      process.env.ANTHROPIC_API_KEY = 'craft-credits-placeholder';
      process.env.USE_CRAFT_AI_GATEWAY = 'true';
      process.env.CRAFT_API_GATEWAY_TOKEN = auth.credentials.gatewayToken;
      break;
  }
}

/**
 * Clear all auth-related environment variables.
 */
export function clearAuthEnvironment(): void {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.USE_CRAFT_AI_GATEWAY;
  delete process.env.CRAFT_API_GATEWAY_TOKEN;
}
