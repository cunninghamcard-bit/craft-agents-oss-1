/**
 * Workspace Types
 *
 * Workspaces are the top-level organizational unit. Everything (sources, agents, sessions)
 * is scoped to a workspace.
 *
 * Directory structure:
 * ~/.craft-agent/workspaces/{slug}/
 *   ├── config.json      - Workspace settings
 *   ├── sources/         - Data sources (MCP, API, local)
 *   ├── agents/          - Agent definitions
 *   └── sessions/        - Conversation sessions
 */

import type { Mode } from '../agent/mode-manager.ts';

/**
 * Workspace configuration (stored in config.json)
 */
export interface WorkspaceConfig {
  id: string;
  name: string;
  slug: string; // Folder name (URL-safe)

  /**
   * Default settings for new sessions in this workspace
   */
  defaults?: {
    model?: string;
    enabledSourceSlugs?: string[]; // Sources to enable by default
    modes?: Mode[]; // Default modes (e.g., ['safe'])
    skipPermissions?: boolean;
    workingDirectory?: string;
  };

  createdAt: number;
  updatedAt: number;
}

/**
 * Workspace creation input
 */
export interface CreateWorkspaceInput {
  name: string;
  defaults?: WorkspaceConfig['defaults'];
}

/**
 * Loaded workspace with resolved sources and agents
 */
export interface LoadedWorkspace {
  config: WorkspaceConfig;
  sourceSlugs: string[]; // Available source slugs (not fully loaded to save memory)
  agentSlugs: string[]; // Available agent slugs
  sessionCount: number; // Number of sessions
}

/**
 * Workspace summary for listing (lightweight)
 */
export interface WorkspaceSummary {
  slug: string;
  name: string;
  sourceCount: number;
  agentCount: number;
  sessionCount: number;
  createdAt: number;
  updatedAt: number;
}
