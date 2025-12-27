/**
 * Built-in Agents
 *
 * System agents that ship with the app but are hidden from the sidebar.
 * Uses dot prefix convention (e.g., `.source-setup`) to mark as hidden.
 *
 * These agents are created on-demand in the workspace folder using the
 * same filesystem structure as user agents.
 */

import { mkdirSync } from 'fs';
import { agentExists, saveAgentInstructions, loadAgentConfig, saveAgentConfig, getAgentPath } from './folder-storage.ts';
import type { FolderAgentConfig } from './folder-types.ts';
import { debug } from '../utils/debug.ts';

/**
 * Built-in agent definition
 */
interface BuiltinAgentSpec {
  name: string;
  slug: string;
  instructions: string;
  /** Version for updating instructions when they change */
  version: number;
}

/**
 * Source Setup Agent Instructions
 */
const SOURCE_SETUP_INSTRUCTIONS = `# Source Setup Agent

You are a specialized agent for helping users configure data sources (MCP servers, REST APIs, and local filesystems).

## Your Role

Help users connect external services to their Craft Agent workspace. Guide them through the configuration process conversationally, gathering the necessary information step by step.

## Source Types

### MCP Servers (Model Context Protocol)
- Protocol-based servers that expose tools and resources
- Common providers: Craft, Linear, GitHub, Notion, Slack, Exa
- Auth types: OAuth (browser-based), Bearer token, or none

### REST APIs
- Traditional HTTP APIs with various auth methods
- Auth types: Bearer token, API key (header or query param), Basic auth, OAuth

### Local Sources (Future)
- Filesystem access, local databases, etc.

## Configuration Flow

1. **Understand the Need**: Ask what service or data the user wants to connect
2. **Identify the Type**: Determine if it's an MCP server, REST API, or local source
3. **Gather Details**:
   - For MCP: URL, auth type (oauth/bearer/none)
   - For API: Base URL, auth type, header name (if applicable)
4. **Present Plan**: Use SubmitPlan to show the configuration for approval
5. **Execute**: On approval, use source_create to add the source

## Available Tools

- \`source_list\`: List all configured sources in the workspace
- \`source_create\`: Create a new source with the gathered configuration
- \`source_update\`: Modify an existing source
- \`source_delete\`: Remove a source
- \`source_test\`: Test if a source is reachable
- \`oauth_trigger\`: Start OAuth authentication flow for a source

## Common Providers

When users mention these services, you can suggest appropriate configurations:

| Service | Type | URL Pattern | Auth |
|---------|------|-------------|------|
| Linear | MCP | https://mcp.linear.app | OAuth |
| GitHub | MCP | varies | OAuth or token |
| Notion | MCP | varies | OAuth |
| Exa | MCP | https://mcp.exa.ai | Bearer token |
| Composio | MCP | https://mcp.composio.dev/... | OAuth |
| Pipedream | MCP | https://mcp.pipedream.com/... | OAuth |

## Example Conversation

User: "I want to connect to Linear"
You: "I can help you set up Linear as an MCP source. Linear uses OAuth for authentication, so you'll need to authorize access through your browser.

Let me create this source for you..."

[Present plan with source configuration]

## Important Notes

- Always use SubmitPlan before creating sources so users can review
- Test sources after creation when possible
- Guide users through OAuth flows when needed
- Be helpful with troubleshooting connection issues
`;

/**
 * Registry of built-in agents
 */
const BUILTIN_AGENTS: Record<string, BuiltinAgentSpec> = {
  '.source-setup': {
    name: 'Source Setup',
    slug: '.source-setup',
    instructions: SOURCE_SETUP_INSTRUCTIONS,
    version: 1,
  },
};

/**
 * Extended config type to track built-in agent versions
 */
interface BuiltinAgentConfig extends FolderAgentConfig {
  isBuiltin?: boolean;
  builtinVersion?: number;
}

/**
 * Ensure a specific built-in agent exists in the workspace
 */
export function ensureBuiltinAgent(workspaceSlug: string, slug: string): FolderAgentConfig | null {
  const spec = BUILTIN_AGENTS[slug];
  if (!spec) {
    debug(`[ensureBuiltinAgent] Unknown built-in agent: ${slug}`);
    return null;
  }

  // Check if agent already exists
  if (agentExists(workspaceSlug, slug)) {
    // Check if we need to update instructions (version mismatch)
    const config = loadAgentConfig(workspaceSlug, slug) as BuiltinAgentConfig | null;
    if (config) {
      if (config.builtinVersion !== spec.version) {
        debug(`[ensureBuiltinAgent] Updating ${slug} from v${config.builtinVersion} to v${spec.version}`);
        saveAgentInstructions(workspaceSlug, slug, spec.instructions);
        const updatedConfig: BuiltinAgentConfig = {
          ...config,
          builtinVersion: spec.version,
          updatedAt: Date.now(),
        };
        saveAgentConfig(workspaceSlug, updatedConfig);
        return updatedConfig;
      }
      return config;
    }
  }

  // Create the agent directly with the correct slug
  // (bypass createAgent which strips dots from slugs via generateAgentSlug)
  debug(`[ensureBuiltinAgent] Creating built-in agent: ${slug}`);

  const now = Date.now();
  const builtinConfig: BuiltinAgentConfig = {
    name: spec.name,
    slug: spec.slug,
    enabled: true,
    isBuiltin: true,
    builtinVersion: spec.version,
    createdAt: now,
    updatedAt: now,
  };

  // Create the agent directory with the correct slug (including the dot)
  const agentDir = getAgentPath(workspaceSlug, spec.slug);
  mkdirSync(agentDir, { recursive: true });

  // Save config and instructions
  saveAgentConfig(workspaceSlug, builtinConfig);
  saveAgentInstructions(workspaceSlug, spec.slug, spec.instructions);

  return builtinConfig;
}

/**
 * Ensure all built-in agents exist in a workspace
 */
export function ensureBuiltinAgents(workspaceSlug: string): void {
  for (const slug of Object.keys(BUILTIN_AGENTS)) {
    ensureBuiltinAgent(workspaceSlug, slug);
  }
}

/**
 * Check if a slug is a built-in agent
 */
export function isBuiltinAgent(slug: string): boolean {
  return slug in BUILTIN_AGENTS;
}

/**
 * Get list of all built-in agent slugs
 */
export function getBuiltinAgentSlugs(): string[] {
  return Object.keys(BUILTIN_AGENTS);
}
