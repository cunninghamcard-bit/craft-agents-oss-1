/**
 * Session-Scoped Tools
 *
 * Tools that are scoped to a specific session. Each session gets its own
 * instance of these tools with session-specific callbacks and state.
 *
 * Tools included:
 * - SubmitPlan: Submit a plan file for user review/display
 * - change_working_directory: Change the working directory for the session
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { existsSync, readFileSync, statSync } from 'fs';
import { getPlansDir } from '../config/storage.ts';
import { debug } from '../utils/debug.ts';

// ============================================================
// Session-Scoped Tool Callbacks
// ============================================================

/**
 * Callbacks for session-scoped tool operations.
 * These are registered per-session and invoked by tools.
 */
export interface SessionScopedToolCallbacks {
  /** Called when a plan is submitted - triggers plan message display in UI */
  onPlanSubmitted?: (planPath: string) => void;
  /** Called when the working directory changes - syncs with UI and persists */
  onWorkingDirectoryChange?: (path: string) => void;
}

/**
 * Registry mapping session IDs to their callbacks.
 */
const sessionScopedToolCallbackRegistry = new Map<string, SessionScopedToolCallbacks>();

/**
 * Register callbacks for a session's tools.
 * Called by CraftAgent when initializing.
 */
export function registerSessionScopedToolCallbacks(
  sessionId: string,
  callbacks: SessionScopedToolCallbacks
): void {
  sessionScopedToolCallbackRegistry.set(sessionId, callbacks);
  debug(`[SessionScopedTools] Registered callbacks for session ${sessionId}`);
}

/**
 * Unregister callbacks for a session.
 * Called by CraftAgent on dispose.
 */
export function unregisterSessionScopedToolCallbacks(sessionId: string): void {
  sessionScopedToolCallbackRegistry.delete(sessionId);
  debug(`[SessionScopedTools] Unregistered callbacks for session ${sessionId}`);
}

/**
 * Get callbacks for a session.
 */
function getSessionScopedToolCallbacks(sessionId: string): SessionScopedToolCallbacks | undefined {
  return sessionScopedToolCallbackRegistry.get(sessionId);
}

// ============================================================
// Plan File State (per session)
// ============================================================

/**
 * Track the last submitted plan file per session
 */
const sessionPlanFiles = new Map<string, string>();

/**
 * Get the last submitted plan file path for a session
 */
export function getLastPlanFilePath(sessionId: string): string | null {
  return sessionPlanFiles.get(sessionId) ?? null;
}

/**
 * Set the last submitted plan file path for a session
 */
function setLastPlanFilePath(sessionId: string, path: string): void {
  sessionPlanFiles.set(sessionId, path);
}

/**
 * Clear plan file state for a session
 */
export function clearPlanFileState(sessionId: string): void {
  sessionPlanFiles.delete(sessionId);
}

// ============================================================
// Tool Factories
// ============================================================

/**
 * Create a session-scoped SubmitPlan tool.
 * The sessionId is captured at creation time.
 *
 * This is a UNIVERSAL tool - the agent can use it anytime to submit
 * a plan for user review, regardless of Safe Mode status.
 */
export function createSubmitPlanTool(sessionId: string) {
  return tool(
    'SubmitPlan',
    `Submit a plan for user review.

Call this after you have written your plan to a markdown file using the Write tool.
The plan will be displayed to the user in a special formatted view.

This tool can be used anytime - it's not restricted to any particular mode.
Use it whenever you want to present a structured plan to the user.

**Safe Mode Workflow:** When you are in Safe Mode and have completed your research/exploration,
use this tool to present your implementation plan. The plan UI includes an "Accept Plan" button
that exits Safe Mode and allows you to begin implementation immediately.

**Format your plan as markdown:**
\`\`\`markdown
# Plan Title

## Summary
Brief description of what this plan accomplishes.

## Steps
1. **Step description** - Details and approach
2. **Another step** - More details
3. ...
\`\`\`

**IMPORTANT:** After calling this tool:
- Execution will be **automatically paused** to present the plan to the user
- No further tool calls or text output will be processed after this tool returns
- The conversation will resume when the user responds (accept, modify, or reject the plan)
- Do NOT include any text or tool calls after SubmitPlan - they will not be executed`,
    {
      planPath: z.string().describe('Absolute path to the plan markdown file you wrote'),
    },
    async (args) => {
      debug('[SubmitPlan] Called with planPath:', args.planPath);
      debug('[SubmitPlan] sessionId (from closure):', sessionId);

      // Verify the file exists
      if (!existsSync(args.planPath)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Plan file not found at ${args.planPath}. Please write the plan file first using the Write tool.`,
          }],
        };
      }

      // Read the plan content to verify it's valid
      let planContent: string;
      try {
        planContent = readFileSync(args.planPath, 'utf-8');
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error reading plan file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }

      // Store the plan file path
      setLastPlanFilePath(sessionId, args.planPath);

      // Get callbacks and notify UI
      const callbacks = getSessionScopedToolCallbacks(sessionId);
      debug('[SubmitPlan] Registry callbacks found:', !!callbacks);

      if (callbacks?.onPlanSubmitted) {
        callbacks.onPlanSubmitted(args.planPath);
        debug('[SubmitPlan] Callback completed');
      } else {
        debug('[SubmitPlan] No callback registered for session');
      }

      return {
        content: [{
          type: 'text' as const,
          text: 'Plan submitted for review. Waiting for user feedback.',
        }],
        isError: false,
      };
    }
  );
}

/**
 * Create a session-scoped change_working_directory tool.
 * The sessionId is captured at creation time.
 *
 * This tool allows the agent to change the working directory for bash commands
 * and file operations.
 */
export function createChangeWorkingDirectoryTool(sessionId: string) {
  return tool(
    'change_working_directory',
    `Change the working directory for this session.

This changes the directory used for:
- Bash command execution
- File operations (Read, Write, Edit, Glob, Grep)
- Git operations

The change is persisted for the session and reflected in the UI.

Use this when:
- The user asks to work in a different directory
- You need to switch context to a different project
- The current working directory doesn't match the task`,
    {
      path: z.string().describe('Absolute path to the new working directory'),
    },
    async (args) => {
      debug('[change_working_directory] Called with path:', args.path);
      debug('[change_working_directory] sessionId (from closure):', sessionId);

      // Validate the path exists
      if (!existsSync(args.path)) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Directory does not exist: ${args.path}`,
          }],
          isError: true,
        };
      }

      // Validate it's a directory
      try {
        const stats = statSync(args.path);
        if (!stats.isDirectory()) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: Path is not a directory: ${args.path}`,
            }],
            isError: true,
          };
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error checking path: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
          isError: true,
        };
      }

      // Get callbacks and notify
      const callbacks = getSessionScopedToolCallbacks(sessionId);
      debug('[change_working_directory] Registry callbacks found:', !!callbacks);

      if (callbacks?.onWorkingDirectoryChange) {
        callbacks.onWorkingDirectoryChange(args.path);
        debug('[change_working_directory] Callback completed');
      } else {
        debug('[change_working_directory] No callback registered for session');
        return {
          content: [{
            type: 'text' as const,
            text: `Error: Unable to change working directory - no handler registered`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Working directory changed to: ${args.path}`,
        }],
        isError: false,
      };
    }
  );
}

// ============================================================
// Session-Scoped Tools Provider
// ============================================================

/**
 * Cache of session-scoped tool providers, keyed by sessionId.
 */
const sessionScopedToolsCache = new Map<string, ReturnType<typeof createSdkMcpServer>>();

/**
 * Get the session-scoped tools provider for a session.
 * Creates and caches the provider if it doesn't exist.
 */
export function getSessionScopedTools(sessionId: string): ReturnType<typeof createSdkMcpServer> {
  let cached = sessionScopedToolsCache.get(sessionId);
  if (!cached) {
    // Create session-scoped tools that capture the sessionId in their closures
    cached = createSdkMcpServer({
      name: 'session',
      version: '1.0.0',
      tools: [
        createSubmitPlanTool(sessionId),
        createChangeWorkingDirectoryTool(sessionId),
      ],
    });
    sessionScopedToolsCache.set(sessionId, cached);
    debug(`[SessionScopedTools] Created tools provider for session ${sessionId}`);
  }
  return cached;
}

/**
 * Clean up session-scoped tools when a session is disposed.
 * Removes the cached provider and clears all session state.
 */
export function cleanupSessionScopedTools(sessionId: string): void {
  sessionScopedToolsCache.delete(sessionId);
  sessionScopedToolCallbackRegistry.delete(sessionId);
  sessionPlanFiles.delete(sessionId);
  debug(`[SessionScopedTools] Cleaned up session ${sessionId}`);
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get the plans directory for a session
 */
export function getSessionPlansDir(sessionId: string): string {
  return getPlansDir(sessionId);
}

/**
 * Check if a file path is within the plans directory
 */
export function isPathInPlansDir(filePath: string, sessionId: string): boolean {
  const plansDir = getPlansDir(sessionId);
  // Normalize paths for comparison
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPlansDir = plansDir.replace(/\\/g, '/');
  return normalizedPath.startsWith(normalizedPlansDir);
}
