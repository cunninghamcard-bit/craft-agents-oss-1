/**
 * MCP client using official @modelcontextprotocol/sdk
 * Configured for Craft's streamable HTTP transport
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

export interface McpClientConfig {
  url: string;
  headers?: Record<string, string>;
}

// Callback interfaces for capturing MCP tool calls/results
export interface McpToolCallEvent {
  toolName: string;
  toolUseId: string;  // Generated unique ID for correlation
  input: Record<string, unknown>;
  timestamp: number;
}

export interface McpToolResultEvent {
  toolName: string;
  toolUseId: string;
  result: unknown;
  duration: number;
  isError: boolean;
}

export interface McpProxyCallbacks {
  onToolStart?: (event: McpToolCallEvent) => void;
  onToolResult?: (event: McpToolResultEvent) => void;
}

export class CraftMcpClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private connected = false;

  constructor(config: McpClientConfig) {
    this.client = new Client({
      name: 'craft-tui-agent',
      version: '1.0.0',
    });

    this.transport = new StreamableHTTPClientTransport(
      new URL(config.url),
      {
        requestInit: {
          headers: config.headers,
        },
      }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await this.client.connect(this.transport);
    this.connected = true;
  }

  async listTools(): Promise<Tool[]> {
    if (!this.connected) {
      await this.connect();
    }

    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      await this.connect();
    }

    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}

/**
 * Convert MCP tools to Anthropic tool format
 */
export function mcpToolsToAnthropicTools(mcpTools: Tool[]): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: tool.inputSchema as Record<string, unknown>,
  }));
}

/**
 * MCP Proxy that maintains a persistent connection and exposes an in-process SDK MCP server.
 * This eliminates the overhead of reconnecting to the MCP server on every query.
 */
export class CraftMcpProxy {
  private client: CraftMcpClient;
  private cachedTools: Tool[] | null = null;
  private sdkServer: ReturnType<typeof createSdkMcpServer> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private callbacks: McpProxyCallbacks | null = null;

  constructor(config: McpClientConfig) {
    this.client = new CraftMcpClient(config);
  }

  /**
   * Set callbacks to capture MCP tool calls and results.
   * This enables capturing tool execution data that isn't emitted by the SDK.
   */
  setCallbacks(callbacks: McpProxyCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Initialize the proxy: connect to MCP server and cache tools.
   * Safe to call multiple times - will only initialize once.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Prevent concurrent initialization
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    // Connect to the MCP server
    await this.client.connect();

    // Fetch and cache tools
    this.cachedTools = await this.client.listTools();

    // Create the in-process SDK MCP server with cached tools
    this.sdkServer = this.createSdkServer();

    this.initialized = true;
  }



  /**
   * Create an in-process SDK MCP server that proxies tool calls to the persistent client.
   */
  private createSdkServer(): ReturnType<typeof createSdkMcpServer> {
    if (!this.cachedTools) {
      throw new Error('Tools not cached - call initialize() first');
    }

    // Convert MCP tools to SDK tools
    const sdkTools = this.cachedTools.map(mcpTool => {
      // Build a zod schema from the MCP tool's input schema
      const inputSchema = mcpTool.inputSchema as {
        type: string;
        properties?: Record<string, { type: string; description?: string }>;
        required?: string[];
      };

      // Create a dynamic zod schema based on the MCP tool's input schema
      const zodSchema: Record<string, z.ZodTypeAny> = {};

      if (inputSchema.properties) {
        for (const [key, prop] of Object.entries(inputSchema.properties)) {
          let fieldSchema: z.ZodTypeAny;

          // Map JSON schema types to Zod types
          switch (prop.type) {
            case 'string':
              fieldSchema = z.string();
              break;
            case 'number':
              fieldSchema = z.number();
              break;
            case 'integer':
              fieldSchema = z.number().int();
              break;
            case 'boolean':
              fieldSchema = z.boolean();
              break;
            case 'array':
              fieldSchema = z.array(z.unknown());
              break;
            case 'object':
              fieldSchema = z.any();
              break;
            default:
              fieldSchema = z.unknown();
          }

          // Add description if available
          if (prop.description) {
            fieldSchema = fieldSchema.describe(prop.description);
          }

          // Make optional if not required
          if (!inputSchema.required?.includes(key)) {
            fieldSchema = fieldSchema.optional();
          }

          zodSchema[key] = fieldSchema;
        }
      }

      // Create the SDK tool with the proxy handler
      return tool(
        mcpTool.name,
        mcpTool.description || '',
        zodSchema,
        async (args) => {
          // Generate a unique ID for correlation
          const toolUseId = `mcp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const startTime = Date.now();
          const input = args as Record<string, unknown>;

          // Emit tool start event
          this.callbacks?.onToolStart?.({
            toolName: mcpTool.name,
            toolUseId,
            input,
            timestamp: startTime,
          });

          try {
            const result = await this.client.callTool(mcpTool.name, input);

            // Emit tool result event
            this.callbacks?.onToolResult?.({
              toolName: mcpTool.name,
              toolUseId,
              result,
              duration: Date.now() - startTime,
              isError: false,
            });

            return result as { content: Array<{ type: 'text'; text: string }> };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';

            // Emit error result event
            this.callbacks?.onToolResult?.({
              toolName: mcpTool.name,
              toolUseId,
              result: message,
              duration: Date.now() - startTime,
              isError: true,
            });

            return {
              content: [{ type: 'text' as const, text: `Error: ${message}` }],
              isError: true,
            };
          }
        }
      );
    });

    return createSdkMcpServer({
      name: 'craft-proxy',
      version: '1.0.0',
      tools: sdkTools,
    });
  }

  /**
   * Get the in-process SDK MCP server.
   * Must call initialize() first.
   */
  getSdkServer(): ReturnType<typeof createSdkMcpServer> {
    if (!this.sdkServer) {
      throw new Error('Proxy not initialized - call initialize() first');
    }
    return this.sdkServer;
  }

  /**
   * Check if the proxy is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get cached tools (for display purposes).
   */
  getCachedTools(): Tool[] | null {
    return this.cachedTools;
  }

  /**
   * Refresh the token for authenticated requests.
   */
  async updateToken(token: string): Promise<void> {
    // Need to recreate the client with new token
    // For now, we'll need to reinitialize
    // In the future, could add a method to update headers on the transport
  }

  /**
   * Close the connection.
   */
  async close(): Promise<void> {
    await this.client.close();
    this.initialized = false;
    this.sdkServer = null;
    this.cachedTools = null;
    this.initPromise = null;
  }
}
