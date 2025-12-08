/**
 * MCP Connection Validation using Claude Agent SDK
 *
 * Uses the SDK's mcpServerStatus() method to validate MCP connections
 * using the same code path as actual agent usage.
 */

import { query, type McpServerStatus } from '@anthropic-ai/claude-agent-sdk';

export interface McpValidationResult {
  success: boolean;
  error?: string;
  errorType?: 'failed' | 'needs-auth' | 'pending' | 'unknown';
  serverInfo?: {
    name: string;
    version: string;
  };
}

export interface McpValidationConfig {
  /** MCP server URL */
  mcpUrl: string;
  /** Access token for MCP server (OAuth or bearer) */
  mcpAccessToken?: string;
  /** Anthropic API key (for API key auth) */
  claudeApiKey?: string;
  /** Claude OAuth token (for Max subscription auth) */
  claudeOAuthToken?: string;
  /** Model to use for validation (defaults to sonnet) */
  model?: string;
}

/**
 * Validates an MCP connection using the Claude Agent SDK.
 *
 * Creates a minimal query with the MCP server configured, then uses
 * mcpServerStatus() to check if the server is connected. The query
 * is aborted immediately after getting the status.
 */
export async function validateMcpConnection(
  config: McpValidationConfig
): Promise<McpValidationResult> {
  // Store original env vars to restore later
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  try {
    // Set Claude credentials for SDK (temporarily)
    if (config.claudeApiKey) {
      process.env.ANTHROPIC_API_KEY = config.claudeApiKey;
      // Clear OAuth token if API key is provided
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    } else if (config.claudeOAuthToken) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = config.claudeOAuthToken;
      // Clear API key if OAuth token is provided
      delete process.env.ANTHROPIC_API_KEY;
    }

    // Normalize MCP URL (ensure /mcp suffix)
    let mcpUrl = config.mcpUrl;
    if (!mcpUrl.endsWith('/mcp')) {
      mcpUrl = mcpUrl.replace(/\/$/, '') + '/mcp';
    }

    // Build MCP server config
    const mcpServers = {
      validation_target: {
        type: 'http' as const,
        url: mcpUrl,
        ...(config.mcpAccessToken
          ? { headers: { Authorization: `Bearer ${config.mcpAccessToken}` } }
          : {}),
      },
    };

    // Create abort controller to stop query after getting status
    const abortController = new AbortController();

    // Create minimal query with MCP server
    const q = query({
      prompt: '',
      options: {
        mcpServers,
        model: config.model || 'claude-sonnet-4-20250514',
        abortController,
      },
    });

    try {
      // Get server status (this connects to MCP servers)
      const statuses = await q.mcpServerStatus();
      const status = statuses.find((s) => s.name === 'validation_target');

      // Abort query immediately - we don't need to continue
      abortController.abort();

      if (!status) {
        return {
          success: false,
          error: 'Server not found in status response',
          errorType: 'unknown',
        };
      }

      if (status.status === 'connected') {
        return {
          success: true,
          serverInfo: status.serverInfo,
        };
      }

      return {
        success: false,
        error: getValidationErrorMessage({
          success: false,
          errorType: status.status,
        }),
        errorType: status.status,
      };
    } catch (err) {
      // Abort on error
      abortController.abort();

      return {
        success: false,
        error: err instanceof Error ? err.message : 'Validation failed',
        errorType: 'unknown',
      };
    }
  } finally {
    // Restore original env vars
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }

    if (originalOAuthToken !== undefined) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = originalOAuthToken;
    } else {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    }
  }
}

/**
 * Get a user-friendly error message based on the validation result.
 */
export function getValidationErrorMessage(result: McpValidationResult): string {
  switch (result.errorType) {
    case 'failed':
      return 'Could not connect to server - check the URL and your network.';
    case 'needs-auth':
      return 'Server requires authentication - credentials may be invalid.';
    case 'pending':
      return 'Connection is still pending - please try again.';
    case 'unknown':
    default:
      return result.error || 'Connection failed for an unknown reason.';
  }
}
