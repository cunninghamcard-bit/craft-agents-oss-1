/**
 * Workspace Module
 *
 * Re-exports types and storage functions for workspaces.
 */

// Types
export type {
  WorkspaceConfig,
  CreateWorkspaceInput,
  LoadedWorkspace,
  WorkspaceSummary,
} from './types.ts';

// Storage functions
export {
  // Directory utilities
  ensureWorkspacesDir,
  getWorkspacePath,
  getWorkspaceSourcesPath,
  getWorkspaceAgentsPath,
  getWorkspaceSessionsPath,
  getWorkspacesDir,
  // Config operations
  loadWorkspaceConfig,
  saveWorkspaceConfig,
  // Load operations
  loadWorkspace,
  listWorkspaces,
  loadAllWorkspaces,
  // Create/Delete operations
  generateWorkspaceSlug,
  createWorkspace,
  deleteWorkspace,
  workspaceExists,
  getWorkspaceByNameOrSlug,
  renameWorkspace,
  // Workspace selection
  getCurrentWorkspaceSlug,
  setCurrentWorkspaceSlug,
  getCurrentWorkspace,
  // Constants
  CONFIG_DIR,
} from './storage.ts';
