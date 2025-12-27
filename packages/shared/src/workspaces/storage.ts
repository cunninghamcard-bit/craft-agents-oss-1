/**
 * Workspace Storage
 *
 * CRUD operations for workspaces.
 * Workspaces are stored at ~/.craft-agent/workspaces/{slug}/
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type {
  WorkspaceConfig,
  CreateWorkspaceInput,
  LoadedWorkspace,
  WorkspaceSummary,
} from './types.ts';

const CONFIG_DIR = join(homedir(), '.craft-agent');
const WORKSPACES_DIR = join(CONFIG_DIR, 'workspaces');

// ============================================================
// Directory Utilities
// ============================================================

/**
 * Ensure workspaces directory exists
 */
export function ensureWorkspacesDir(): void {
  if (!existsSync(WORKSPACES_DIR)) {
    mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
}

/**
 * Get path to a workspace folder
 */
export function getWorkspacePath(slug: string): string {
  return join(WORKSPACES_DIR, slug);
}

/**
 * Get path to workspace sources directory
 */
export function getWorkspaceSourcesPath(slug: string): string {
  return join(WORKSPACES_DIR, slug, 'sources');
}

/**
 * Get path to workspace agents directory
 */
export function getWorkspaceAgentsPath(slug: string): string {
  return join(WORKSPACES_DIR, slug, 'agents');
}

/**
 * Get path to workspace sessions directory
 */
export function getWorkspaceSessionsPath(slug: string): string {
  return join(WORKSPACES_DIR, slug, 'sessions');
}

/**
 * Get workspaces directory path
 */
export function getWorkspacesDir(): string {
  return WORKSPACES_DIR;
}

// ============================================================
// Config Operations
// ============================================================

/**
 * Load workspace config.json
 */
export function loadWorkspaceConfig(slug: string): WorkspaceConfig | null {
  const configPath = join(WORKSPACES_DIR, slug, 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save workspace config.json
 */
export function saveWorkspaceConfig(config: WorkspaceConfig): void {
  const dir = join(WORKSPACES_DIR, config.slug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  config.updatedAt = Date.now();
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2));
}

// ============================================================
// Load Operations
// ============================================================

/**
 * Count subdirectories in a path
 */
function countSubdirs(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    return readdirSync(path, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * List subdirectory names in a path
 */
function listSubdirNames(path: string): string[] {
  if (!existsSync(path)) return [];
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Load workspace with summary info (not full sources/agents)
 */
export function loadWorkspace(slug: string): LoadedWorkspace | null {
  const config = loadWorkspaceConfig(slug);
  if (!config) return null;

  return {
    config,
    sourceSlugs: listSubdirNames(getWorkspaceSourcesPath(slug)),
    agentSlugs: listSubdirNames(getWorkspaceAgentsPath(slug)),
    sessionCount: countSubdirs(getWorkspaceSessionsPath(slug)),
  };
}

/**
 * List all workspaces (lightweight summary)
 */
export function listWorkspaces(): WorkspaceSummary[] {
  ensureWorkspacesDir();

  const summaries: WorkspaceSummary[] = [];
  const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const config = loadWorkspaceConfig(entry.name);
    if (!config) continue;

    summaries.push({
      slug: config.slug,
      name: config.name,
      sourceCount: countSubdirs(getWorkspaceSourcesPath(config.slug)),
      agentCount: countSubdirs(getWorkspaceAgentsPath(config.slug)),
      sessionCount: countSubdirs(getWorkspaceSessionsPath(config.slug)),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  }

  // Sort by updatedAt descending (most recent first)
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Load all workspaces (full LoadedWorkspace objects)
 */
export function loadAllWorkspaces(): LoadedWorkspace[] {
  ensureWorkspacesDir();

  const workspaces: LoadedWorkspace[] = [];
  const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const workspace = loadWorkspace(entry.name);
      if (workspace) {
        workspaces.push(workspace);
      }
    }
  }

  return workspaces;
}

// ============================================================
// Create/Delete Operations
// ============================================================

/**
 * Generate URL-safe slug from name
 */
export function generateWorkspaceSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Ensure slug is not empty
  if (!slug) {
    slug = 'workspace';
  }

  // Check for existing slugs and append number if needed
  const existingSlugs = new Set<string>();
  if (existsSync(WORKSPACES_DIR)) {
    const entries = readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        existingSlugs.add(entry.name);
      }
    }
  }

  if (!existingSlugs.has(slug)) {
    return slug;
  }

  // Find next available number
  let counter = 2;
  while (existingSlugs.has(`${slug}-${counter}`)) {
    counter++;
  }

  return `${slug}-${counter}`;
}

/**
 * Create a new workspace
 */
export function createWorkspace(input: CreateWorkspaceInput): WorkspaceConfig {
  const slug = generateWorkspaceSlug(input.name);
  const now = Date.now();

  const config: WorkspaceConfig = {
    id: `ws_${randomUUID().slice(0, 8)}`,
    name: input.name,
    slug,
    defaults: input.defaults,
    createdAt: now,
    updatedAt: now,
  };

  // Create workspace directory structure
  const workspacePath = getWorkspacePath(slug);
  mkdirSync(workspacePath, { recursive: true });
  mkdirSync(getWorkspaceSourcesPath(slug), { recursive: true });
  mkdirSync(getWorkspaceAgentsPath(slug), { recursive: true });
  mkdirSync(getWorkspaceSessionsPath(slug), { recursive: true });

  // Save config
  saveWorkspaceConfig(config);

  return config;
}

/**
 * Delete a workspace and all its contents
 */
export function deleteWorkspace(slug: string): boolean {
  const dir = getWorkspacePath(slug);
  if (!existsSync(dir)) return false;

  try {
    rmSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a workspace exists
 */
export function workspaceExists(slug: string): boolean {
  return existsSync(join(WORKSPACES_DIR, slug, 'config.json'));
}

/**
 * Get workspace by name (case-insensitive) or slug
 */
export function getWorkspaceByNameOrSlug(nameOrSlug: string): WorkspaceConfig | null {
  const workspaces = listWorkspaces();
  const match = workspaces.find(
    (w) => w.slug === nameOrSlug || w.name.toLowerCase() === nameOrSlug.toLowerCase()
  );
  if (!match) return null;
  return loadWorkspaceConfig(match.slug);
}

/**
 * Rename a workspace
 */
export function renameWorkspace(slug: string, newName: string): boolean {
  const config = loadWorkspaceConfig(slug);
  if (!config) return false;

  config.name = newName.trim();
  saveWorkspaceConfig(config);
  return true;
}

// ============================================================
// Workspace Selection (Current Workspace)
// ============================================================

/**
 * Get the current workspace slug from global config
 */
export function getCurrentWorkspaceSlug(): string | null {
  const globalConfigPath = join(CONFIG_DIR, 'config.json');
  if (!existsSync(globalConfigPath)) return null;

  try {
    const content = readFileSync(globalConfigPath, 'utf-8');
    const globalConfig = JSON.parse(content);
    return globalConfig.currentWorkspaceSlug ?? null;
  } catch {
    return null;
  }
}

/**
 * Set the current workspace slug in global config
 */
export function setCurrentWorkspaceSlug(slug: string | null): void {
  const globalConfigPath = join(CONFIG_DIR, 'config.json');

  let globalConfig: Record<string, unknown> = {};
  if (existsSync(globalConfigPath)) {
    try {
      globalConfig = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    } catch {
      // Start fresh if corrupt
    }
  }

  if (slug) {
    globalConfig.currentWorkspaceSlug = slug;
  } else {
    delete globalConfig.currentWorkspaceSlug;
  }

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
}

/**
 * Get the current workspace (or first available if none selected)
 */
export function getCurrentWorkspace(): WorkspaceConfig | null {
  const currentSlug = getCurrentWorkspaceSlug();
  if (currentSlug) {
    const config = loadWorkspaceConfig(currentSlug);
    if (config) return config;
  }

  // Fall back to first workspace
  const workspaces = listWorkspaces();
  if (workspaces.length === 0) return null;

  const first = workspaces[0];
  if (!first) return null;
  return loadWorkspaceConfig(first.slug);
}

// ============================================================
// Exports
// ============================================================

export { CONFIG_DIR };
