/**
 * MCP Connection Validation
 *
 * Validates HTTP/SSE MCP servers by connecting directly via CraftMcpClient
 * and listing tools. Avoids spawning a Claude Code subprocess (which is killed
 * by Electron's macOS sandbox — see issue #697).
 */

import { CraftMcpClient } from './client.js';
import { debug } from '../utils/debug.ts';
import { normalizeMcpUrl } from '../sources/server-builder.ts';
import type { McpTransport } from '../sources/types.ts';

export interface InvalidProperty {
  toolName: string;
  propertyPath: string;
  propertyKey: string;
}

export interface McpValidationResult {
  success: boolean;
  error?: string;
  errorType?: 'failed' | 'needs-auth' | 'pending' | 'invalid-schema' | 'disabled' | 'unknown';
  serverInfo?: {
    name: string;
    version: string;
  };
  invalidProperties?: InvalidProperty[];
  /** Tool names available on this server (populated on successful connection) */
  tools?: string[];
}

/**
 * Pattern for valid property names in tool input schemas.
 * Must match: letters, numbers, underscores, dots, hyphens (1-64 chars)
 *
 * This pattern is enforced server-side by the Anthropic API.
 * It is NOT defined in the MCP specification (which has no naming constraints).
 * It is NOT exported by @anthropic-ai/sdk or @anthropic-ai/claude-agent-sdk.
 *
 * API error when violated:
 * "tools.0.custom.input_schema.properties: Property keys should match pattern '^[a-zA-Z0-9_.-]{1,64}$'"
 *
 * @see https://github.com/modelcontextprotocol/go-sdk/issues/169 - confirms this is Claude-specific
 * @see https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
 */
export const ANTHROPIC_PROPERTY_NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

/**
 * Recursively finds invalid property names in a JSON schema.
 * Returns an array of invalid properties with their paths.
 */
function findInvalidProperties(
  schema: Record<string, unknown>,
  path = ''
): { path: string; key: string }[] {
  const invalid: { path: string; key: string }[] = [];

  if (!schema || typeof schema !== 'object') {
    return invalid;
  }

  // Check properties object
  if (schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties as Record<string, unknown>;
    for (const key of Object.keys(properties)) {
      if (!ANTHROPIC_PROPERTY_NAME_PATTERN.test(key)) {
        invalid.push({
          path: path ? `${path}.${key}` : key,
          key,
        });
      }
      // Recurse into nested schemas
      const nestedSchema = properties[key];
      if (nestedSchema && typeof nestedSchema === 'object') {
        invalid.push(
          ...findInvalidProperties(
            nestedSchema as Record<string, unknown>,
            path ? `${path}.${key}` : key
          )
        );
      }
    }
  }

  // Check items for arrays
  if (schema.items && typeof schema.items === 'object') {
    invalid.push(
      ...findInvalidProperties(
        schema.items as Record<string, unknown>,
        path ? `${path}[]` : '[]'
      )
    );
  }

  // Check additionalProperties if it's a schema object
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    invalid.push(
      ...findInvalidProperties(
        schema.additionalProperties as Record<string, unknown>,
        path ? `${path}.<additionalProperties>` : '<additionalProperties>'
      )
    );
  }

  return invalid;
}

export interface McpValidationConfig {
  /** MCP server URL */
  mcpUrl: string;
  /** Transport type ('http' or 'sse'). Defaults to 'http'. */
  mcpTransport?: McpTransport;
  /** Custom headers for MCP requests (merged before auth headers) */
  mcpHeaders?: Record<string, string>;
  /** Access token for MCP server (OAuth or bearer) */
  mcpAccessToken?: string;
}

/**
 * Map a low-level connection error to a user-actionable result.
 * Heuristic — keep simple, the underlying message is preserved as the source of truth.
 */
function classifyConnectionError(err: unknown): McpValidationResult {
  const message = err instanceof Error ? err.message : String(err);
  let errorType: McpValidationResult['errorType'] = 'failed';
  if (/\b401\b|\b403\b|unauthorized|forbidden|authentication/i.test(message)) {
    errorType = 'needs-auth';
  }
  return {
    success: false,
    error: message || 'Validation failed',
    errorType,
  };
}

/**
 * Validates an HTTP/SSE MCP connection by connecting via CraftMcpClient and
 * listing tools. The internal `connect()` call performs a `listTools()` health
 * check, so a successful connect proves the server is reachable and responsive.
 */
export async function validateMcpConnection(
  config: McpValidationConfig
): Promise<McpValidationResult> {
  debug('Validating MCP connection to', config.mcpUrl);

  const mcpUrl = normalizeMcpUrl(config.mcpUrl);

  // Custom headers first, auth header overrides.
  const headers = {
    ...config.mcpHeaders,
    ...(config.mcpAccessToken ? { Authorization: `Bearer ${config.mcpAccessToken}` } : {}),
  };

  // SSE transport is not supported by CraftMcpClient (HTTP only). Streamable
  // HTTP is the modern transport; SSE servers will surface a clear connect error.
  const mcpClient = new CraftMcpClient({
    transport: 'http',
    url: mcpUrl,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  try {
    await mcpClient.connect();
    const serverInfo = mcpClient.getServerInfo();

    const tools = await mcpClient.listTools();
    const toolNames = tools.map((t) => t.name);

    debug(`Validating schemas for ${tools.length} tools`);

    const allInvalidProperties: InvalidProperty[] = [];
    for (const tool of tools) {
      if (tool.inputSchema && typeof tool.inputSchema === 'object') {
        const invalidProps = findInvalidProperties(
          tool.inputSchema as Record<string, unknown>
        );
        for (const prop of invalidProps) {
          allInvalidProperties.push({
            toolName: tool.name,
            propertyPath: prop.path,
            propertyKey: prop.key,
          });
        }
      }
    }

    if (allInvalidProperties.length > 0) {
      const toolsWithIssues = [
        ...new Set(allInvalidProperties.map((p) => p.toolName)),
      ];
      return {
        success: false,
        error: `Server has ${allInvalidProperties.length} invalid property name(s) in ${toolsWithIssues.length} tool(s): ${toolsWithIssues.join(', ')}. Property names must match ^[a-zA-Z0-9_.-]{1,64}$`,
        errorType: 'invalid-schema',
        serverInfo,
        invalidProperties: allInvalidProperties,
        tools: toolNames,
      };
    }

    return {
      success: true,
      serverInfo,
      tools: toolNames,
    };
  } catch (err) {
    debug('[mcp-validation] error:', err instanceof Error ? err.message : err);
    return classifyConnectionError(err);
  } finally {
    await mcpClient.close().catch(() => {});
  }
}

export interface StdioValidationConfig {
  /** Command to spawn (e.g., 'npx', 'node') */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables for the spawned process */
  env?: Record<string, string>;
  /** Timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * Validates a stdio MCP connection by spawning the process and listing tools.
 *
 * Unlike HTTP validation, this actually spawns the MCP server process,
 * connects via stdio transport, and validates the available tools.
 *
 * Process lifecycle is owned exclusively by `StdioClientTransport` — we do
 * NOT spawn a second copy of the server. Earlier versions did, which caused
 * "Server startup timeout" symptoms because the unused first child held pipes
 * with no consumer (see #787).
 */
export async function validateStdioMcpConnection(
  config: StdioValidationConfig
): Promise<McpValidationResult> {
  const { command, args = [], env = {}, timeout = 30000 } = config;

  // Split the budget: most "MCP doesn't work" failures fail to even complete
  // the `initialize` handshake — so failing fast on connect with a specific
  // diagnostic beats burning the whole 30s on a generic timeout.
  const connectTimeout = Math.min(8000, Math.max(1000, Math.floor(timeout / 2)));
  const listToolsTimeout = Math.max(1000, timeout - connectTimeout);

  debug(`[stdio-validation] Spawning: ${command} ${args.join(' ')}`);

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/stdio.js'
  );

  let client: InstanceType<typeof Client> | null = null;
  let transport: InstanceType<typeof StdioClientTransport> | null = null;
  let stderrOutput = '';
  // Track which phase failed for richer diagnostics.
  let phase: 'connect' | 'list-tools' | 'unknown' = 'unknown';

  const cleanup = async () => {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore close errors — best-effort.
      }
      client = null;
    }
    if (transport) {
      try {
        await transport.close();
      } catch {
        // Ignore close errors — SDK kills the subprocess internally.
      }
      transport = null;
    }
  };

  // Filter out undefined entries from process.env before merging.
  const processEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      processEnv[key] = value;
    }
  }

  const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const id = setTimeout(() => {
        reject(new Error(`Timeout: ${label} did not complete within ${ms}ms`));
      }, ms);
      p.then(
        (v) => {
          clearTimeout(id);
          resolve(v);
        },
        (e) => {
          clearTimeout(id);
          reject(e);
        },
      );
    });
  };

  try {
    transport = new StdioClientTransport({
      command,
      args,
      env: { ...processEnv, ...env },
      stderr: 'pipe',
    });

    // The SDK exposes a PassThrough _before_ `start()` is called, so this
    // listener catches early startup output too.
    transport.stderr?.on('data', (data: Buffer | string) => {
      stderrOutput += typeof data === 'string' ? data : data.toString();
      if (stderrOutput.length > 10000) {
        stderrOutput = stderrOutput.slice(-10000);
      }
    });

    client = new Client(
      { name: 'craft-agent-validator', version: '1.0.0' },
      { capabilities: {} }
    );

    phase = 'connect';
    await withTimeout(client.connect(transport), connectTimeout, 'MCP initialize');

    phase = 'list-tools';
    const toolsResult = await withTimeout(
      client.listTools(),
      listToolsTimeout,
      'tools/list',
    );
    const tools = toolsResult.tools || [];
    const toolNames = tools.map((t: { name: string }) => t.name);

    debug(`[stdio-validation] Found ${tools.length} tools`);

    // Validate tool schemas for property naming
    const allInvalidProperties: InvalidProperty[] = [];
    for (const tool of tools) {
      if (tool.inputSchema && typeof tool.inputSchema === 'object') {
        const invalidProps = findInvalidProperties(
          tool.inputSchema as Record<string, unknown>
        );
        for (const prop of invalidProps) {
          allInvalidProperties.push({
            toolName: tool.name,
            propertyPath: prop.path,
            propertyKey: prop.key,
          });
        }
      }
    }

    if (allInvalidProperties.length > 0) {
      const toolsWithIssues = [
        ...new Set(allInvalidProperties.map((p) => p.toolName)),
      ];
      return {
        success: false,
        error: `Server has ${allInvalidProperties.length} invalid property name(s) in ${toolsWithIssues.length} tool(s): ${toolsWithIssues.join(', ')}. Property names must match ^[a-zA-Z0-9_.-]{1,64}$`,
        errorType: 'invalid-schema' as const,
        invalidProperties: allInvalidProperties,
        tools: toolNames,
      };
    }

    return {
      success: true,
      tools: toolNames,
      serverInfo: {
        name: command,
        version: args.join(' '),
      },
    };
  } catch (err) {
    const error = err as Error;
    debug(`[stdio-validation] Error in phase=${phase}: ${error.message}`);

    const stderrSnippet = stderrOutput.trim().slice(-500);
    const errorType: McpValidationResult['errorType'] = 'failed';
    let errorMessage: string;

    // Hint for any failure during the `initialize` handshake — by far the most
    // common cause for users porting code from other RPC conventions is wrong
    // framing on stdout. The MCP stdio spec mandates newline-delimited
    // JSON-RPC. LSP-style `Content-Length: …\r\n\r\n{json}` is the typical
    // misstep and reproducibly produces both timeouts and "Connection closed"
    // errors here depending on exactly how the buffer fragments.
    const framingHint =
      'Check that the server speaks newline-delimited JSON-RPC (MCP stdio spec) on stdout, not LSP-style Content-Length framing.';

    if (error.message.includes('ENOENT') || error.message.includes('not found')) {
      errorMessage = `Command not found: "${command}". Install the required dependency and try again.`;
    } else if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
      errorMessage = `Permission denied running "${command}". Check file permissions.`;
    } else if (error.message.includes('Timeout')) {
      // Phase split: connect timeouts are diagnostic, list-tools timeouts are not.
      if (phase === 'connect') {
        errorMessage = stderrSnippet
          ? `MCP initialize not acknowledged within ${connectTimeout}ms. ${framingHint}\nstderr (tail):\n${stderrSnippet}`
          : `MCP initialize not acknowledged within ${connectTimeout}ms and the server produced no stderr output. ${framingHint}`;
      } else if (phase === 'list-tools') {
        errorMessage = stderrSnippet
          ? `tools/list did not respond within ${listToolsTimeout}ms.\nstderr (tail):\n${stderrSnippet}`
          : `tools/list did not respond within ${listToolsTimeout}ms.`;
      } else {
        errorMessage = stderrSnippet
          ? `Server did not respond within ${timeout}ms.\nstderr (tail):\n${stderrSnippet}`
          : `Server did not respond within ${timeout}ms.`;
      }
    } else if (phase === 'connect') {
      // Anything else during connect (Connection closed, parse error, etc.)
      // → still a protocol problem. Lead with the framing hint.
      errorMessage = stderrSnippet
        ? `MCP initialize failed: ${error.message}. ${framingHint}\nstderr (tail):\n${stderrSnippet}`
        : `MCP initialize failed: ${error.message}. ${framingHint}`;
    } else if (stderrSnippet) {
      errorMessage = `${error.message}\nstderr (tail):\n${stderrSnippet}`;
    } else {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
      errorType,
    };
  } finally {
    await cleanup();
  }
}

/**
 * Get a user-friendly error message based on the validation result.
 * Accepts optional transport context to distinguish local (stdio) vs remote failures.
 */
export function getValidationErrorMessage(
  result: McpValidationResult,
  context?: { transport?: string }
): string {
  // Prefer the SDK's error field when available (most specific)
  if (result.error) return result.error;

  switch (result.errorType) {
    case 'failed':
      // Distinguish local stdio servers (crashed/not running) from remote (unreachable)
      if (context?.transport === 'stdio') {
        return 'Server process not running or failed to start.';
      }
      return 'Server unreachable - check the URL and your network.';
    case 'needs-auth':
      return 'Authentication expired or was revoked.';
    case 'pending':
      return 'Connection is still pending - try again.';
    case 'invalid-schema':
      return 'Server has tools with invalid property names.';
    case 'unknown':
    default:
      return 'Connection failed - check source configuration.';
  }
}
