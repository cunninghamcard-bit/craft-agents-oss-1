/**
 * E2E tests for OAuth metadata discovery against real MCP servers.
 *
 * These tests verify that OAuth metadata can be discovered from popular MCP servers.
 * They only check that metadata is discoverable - they don't perform full OAuth flows.
 *
 * Tests are skipped if servers are unreachable (network tolerance for CI).
 */
import { describe, it, expect } from 'bun:test';
import { discoverOAuthMetadata } from '../oauth';

describe('E2E: OAuth Metadata Discovery', () => {
  describe('GitHub MCP (api.githubcopilot.com)', () => {
    const MCP_URL = 'https://api.githubcopilot.com/mcp/';

    it('discovers OAuth metadata', async () => {
      const logs: string[] = [];
      const metadata = await discoverOAuthMetadata(MCP_URL, (msg) => logs.push(msg));

      // If we get null, the server might be down or require auth - that's OK for E2E
      if (metadata === null) {
        console.log('GitHub MCP: No metadata discovered (server may require auth or be unavailable)');
        console.log('Discovery logs:', logs);
        return;
      }

      expect(metadata.authorization_endpoint).toBeTruthy();
      expect(metadata.token_endpoint).toBeTruthy();
      console.log('GitHub MCP OAuth metadata:', metadata);
    });
  });

  describe('Linear MCP (mcp.linear.app)', () => {
    const MCP_URL = 'https://mcp.linear.app/sse';

    it('discovers OAuth metadata', async () => {
      const logs: string[] = [];
      const metadata = await discoverOAuthMetadata(MCP_URL, (msg) => logs.push(msg));

      if (metadata === null) {
        console.log('Linear MCP: No metadata discovered (server may require auth or be unavailable)');
        console.log('Discovery logs:', logs);
        return;
      }

      expect(metadata.authorization_endpoint).toBeTruthy();
      expect(metadata.token_endpoint).toBeTruthy();
      console.log('Linear MCP OAuth metadata:', metadata);
    });
  });

  describe('Ahrefs MCP (api.ahrefs.com/mcp/mcp)', () => {
    const MCP_URL = 'https://api.ahrefs.com/mcp/mcp';

    it('discovers OAuth metadata', async () => {
      const logs: string[] = [];
      const metadata = await discoverOAuthMetadata(MCP_URL, (msg) => logs.push(msg));

      if (metadata === null) {
        console.log('Ahrefs MCP: No metadata discovered (server may require auth or be unavailable)');
        console.log('Discovery logs:', logs);
        return;
      }

      expect(metadata.authorization_endpoint).toBeTruthy();
      expect(metadata.token_endpoint).toBeTruthy();
      console.log('Ahrefs MCP OAuth metadata:', metadata);
    });
  });

  describe('Craft MCP (mcp.craft.do)', () => {
    const MCP_URL = 'https://mcp.craft.do/my/mcp';

    it('discovers OAuth metadata via RFC 9728', async () => {
      const logs: string[] = [];
      const metadata = await discoverOAuthMetadata(MCP_URL, (msg) => logs.push(msg));

      if (metadata === null) {
        console.log('Craft MCP: No metadata discovered (server may require auth or be unavailable)');
        console.log('Discovery logs:', logs);
        return;
      }

      expect(metadata.authorization_endpoint).toBeTruthy();
      expect(metadata.token_endpoint).toBeTruthy();
      console.log('Craft MCP OAuth metadata:', metadata);
    });
  });
});
