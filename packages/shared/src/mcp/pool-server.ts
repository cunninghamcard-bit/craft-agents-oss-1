/**
 * MCP Pool Server
 *
 * Serves McpClientPool tools over HTTP using the MCP Streamable HTTP protocol.
 * This allows external SDK subprocesses (Codex, Copilot) to access pool-managed
 * MCP source tools through a single HTTP endpoint instead of connecting to each
 * source independently.
 *
 * Architecture:
 *   Codex/Copilot SDK subprocess
 *       ↓ (HTTP MCP protocol)
 *   McpPoolServer (this, in Electron main process)
 *       ↓
 *   McpClientPool
 *       ↓ (per-source MCP connections)
 *   Linear / GitHub / Notion / etc.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpClientPool } from './mcp-pool.ts';

export class McpPoolServer {
  private pool: McpClientPool;
  private httpServer: HttpServer | null = null;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();
  private debugFn: ((msg: string) => void) | undefined;
  private _port = 0;

  constructor(pool: McpClientPool, options?: { debug?: (msg: string) => void }) {
    this.pool = pool;
    this.debugFn = options?.debug;
  }

  private debug(msg: string): void {
    this.debugFn?.(`[McpPoolServer] ${msg}`);
  }

  get port(): number {
    return this._port;
  }

  get url(): string {
    return `http://127.0.0.1:${this._port}/mcp`;
  }

  /**
   * Start the HTTP MCP server on a random port.
   * Returns the URL clients should connect to.
   */
  async start(): Promise<string> {
    if (this.httpServer) {
      return this.url;
    }

    this.httpServer = createServer(async (req, res) => {
      // Only handle /mcp path
      const url = new URL(req.url || '/', `http://127.0.0.1`);
      if (url.pathname !== '/mcp') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      // Get or create transport for this session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && this.transports.has(sessionId)) {
        // Existing session
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === 'POST' && !sessionId) {
        // New session — create transport and server
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => `pool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });

        const server = this.createMcpServer();
        await server.connect(transport);

        // Track transport by session ID after connection
        if (transport.sessionId) {
          this.transports.set(transport.sessionId, transport);
        }

        transport.onclose = () => {
          if (transport.sessionId) {
            this.transports.delete(transport.sessionId);
          }
          server.close().catch(() => {});
        };

        await transport.handleRequest(req, res);
        return;
      }

      // Unknown session or invalid request
      res.writeHead(400);
      res.end('Bad Request');
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(0, '127.0.0.1', () => {
        const addr = this.httpServer!.address();
        this._port = typeof addr === 'object' && addr ? addr.port : 0;
        this.debug(`Listening on 127.0.0.1:${this._port}`);
        resolve();
      });
      this.httpServer!.on('error', reject);
    });

    return this.url;
  }

  /**
   * Create an MCP Server instance wired to the pool.
   * Each client session gets its own Server instance, but they all
   * share the same pool for tool discovery and execution.
   */
  private createMcpServer(): Server {
    const server = new Server(
      { name: 'craft-pool-proxy', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    // List tools — proxy from pool
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const proxyDefs = this.pool.getProxyToolDefs();
      return {
        tools: proxyDefs.map(def => ({
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema as {
            type: 'object';
            properties?: Record<string, unknown>;
          },
        })),
      };
    });

    // Call tool — route through pool
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      this.debug(`Tool call: ${name}`);

      const result = await this.pool.callTool(name, args || {});

      return {
        content: [{ type: 'text' as const, text: result.content }],
        ...(result.isError ? { isError: true } : {}),
      };
    });

    return server;
  }

  /**
   * Stop the HTTP server and close all transports.
   */
  async stop(): Promise<void> {
    // Close all active transports
    for (const transport of this.transports.values()) {
      await transport.close().catch(() => {});
    }
    this.transports.clear();

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
      this._port = 0;
      this.debug('Stopped');
    }
  }
}
