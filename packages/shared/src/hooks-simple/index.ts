/**
 * Craft Agent Hooks - Simple Implementation
 *
 * KISS version: One file, minimal types, just works.
 *
 * Usage:
 *   1. Create hooks.json in your workspace
 *   2. Call initHooks({ workspaceRootPath: '...' })
 *   3. Call emitHook('StatusChange', { oldStatus: 'todo', newStatus: 'done' })
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  permissionsConfigCache,
  type PermissionsContext,
  type MergedPermissionsConfig,
} from '../agent/permissions-config.ts';
import { getBashRejectionReason, formatBashRejectionMessage } from '../agent/mode-manager.ts';
import type { ValidationResult, ValidationIssue } from '../config/validators.ts';

const execAsync = promisify(exec);

// ============================================================================
// Types (minimal)
// ============================================================================

/** App events - handled by Craft */
export type AppEvent =
  | 'StatusChange'
  | 'LabelAdd'
  | 'LabelRemove'
  | 'PermissionModeChange';

/** Agent events - passed to Claude SDK */
export type AgentEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop';

export type HookEvent = AppEvent | AgentEvent;

const APP_EVENTS: AppEvent[] = ['StatusChange', 'LabelAdd', 'LabelRemove', 'PermissionModeChange'];
const AGENT_EVENTS: AgentEvent[] = ['PreToolUse', 'PostToolUse', 'Stop'];

/** A command hook - executes a shell command */
export interface CommandHookDefinition {
  type: 'command';
  command: string;
  timeout?: number;
}

/** A prompt hook - sends a prompt to Craft Agent (App events only) */
export interface PromptHookDefinition {
  type: 'prompt';
  prompt: string;
}

export type HookDefinition = CommandHookDefinition | PromptHookDefinition;

export interface HookMatcher {
  matcher?: string;
  hooks: HookDefinition[];
}

export interface HooksConfig {
  hooks: Partial<Record<HookEvent, HookMatcher[]>>;
}

/** Result of a command hook execution */
export interface CommandHookResult {
  type: 'command';
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
  blocked?: boolean;
}

/** References parsed from a prompt (@name for sources and skills) */
export interface PromptReferences {
  /**
   * All @name references found in the prompt.
   * These could be sources (@linear, @github) or skills (@commit, @review-pr).
   * The caller should resolve which are sources vs skills based on available configurations.
   */
  mentions: string[];
}

/** Result of a prompt hook - returns the prompt to be executed by caller */
export interface PromptHookResult {
  type: 'prompt';
  prompt: string;
  /** The expanded prompt with environment variables substituted */
  expandedPrompt: string;
  /** References to sources and skills found in the prompt */
  references: PromptReferences;
}

export type HookExecutionResult = CommandHookResult | PromptHookResult;

/** A pending prompt with its metadata */
export interface PendingPrompt {
  /** The session ID this prompt should be sent to */
  sessionId: string | undefined;
  /** The expanded prompt text */
  prompt: string;
  /**
   * All @mentions found in the prompt (sources and skills).
   * The caller should resolve which are sources vs skills based on available configurations.
   */
  mentions: string[];
}

export interface HookResult {
  event: string;
  matched: number;
  results: HookExecutionResult[];
  /** Prompts that should be executed by Craft Agent (with metadata) */
  pendingPrompts: PendingPrompt[];
}

// ============================================================================
// Zod Schema for Validation
// ============================================================================

const CommandHookSchema = z.object({
  type: z.literal('command'),
  command: z.string().min(1, 'Command cannot be empty'),
  timeout: z.number().positive().optional(),
});

const PromptHookSchema = z.object({
  type: z.literal('prompt'),
  prompt: z.string().min(1, 'Prompt cannot be empty'),
});

const HookDefinitionSchema = z.discriminatedUnion('type', [
  CommandHookSchema,
  PromptHookSchema,
]);

const HookMatcherSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(HookDefinitionSchema).min(1, 'At least one hook required'),
});

const VALID_EVENTS = [
  'StatusChange', 'LabelAdd', 'LabelRemove', 'PermissionModeChange',
  'PreToolUse', 'PostToolUse', 'Stop',
] as const;

const HooksConfigSchema = z.object({
  version: z.number().optional(),
  hooks: z.record(z.string(), z.array(HookMatcherSchema)).optional().default({}),
}).transform((data) => {
  // Filter out invalid event names and warn
  const validHooks: Record<string, z.infer<typeof HookMatcherSchema>[]> = {};
  const invalidEvents: string[] = [];

  for (const [event, matchers] of Object.entries(data.hooks)) {
    if (VALID_EVENTS.includes(event as (typeof VALID_EVENTS)[number])) {
      validHooks[event] = matchers;
    } else {
      invalidEvents.push(event);
    }
  }

  if (invalidEvents.length > 0) {
    console.warn(`[hooks] Unknown event types ignored: ${invalidEvents.join(', ')}`);
  }

  return { version: data.version, hooks: validHooks };
});

/** Internal validation result that includes the parsed config */
export type HooksValidationResult = {
  valid: boolean;
  errors: string[];
  config: HooksConfig | null;
};

/**
 * Convert Zod error to ValidationIssues (matches validators.ts pattern)
 */
function zodErrorToIssues(error: z.ZodError, file: string): ValidationIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.join('.') || 'root',
    message: issue.message,
    severity: 'error' as const,
  }));
}

/**
 * Validate hooks config (internal - returns parsed config)
 */
export function validateHooksConfig(content: unknown): HooksValidationResult {
  const result = HooksConfigSchema.safeParse(content);

  if (result.success) {
    return { valid: true, errors: [], config: result.data as HooksConfig };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return { valid: false, errors, config: null };
}

/**
 * Validate hooks config from a JSON string (no disk reads).
 * Used by PreToolUse hook to validate before writing to disk.
 * Follows the same pattern as other config validators in validators.ts.
 */
export function validateHooksContent(jsonString: string): ValidationResult {
  const file = 'hooks.json';
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Parse JSON
  let content: unknown;
  try {
    content = JSON.parse(jsonString);
  } catch (e) {
    return {
      valid: false,
      errors: [{
        file,
        path: '',
        message: `Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`,
        severity: 'error',
      }],
      warnings: [],
    };
  }

  // Validate schema
  const result = HooksConfigSchema.safeParse(content);
  if (!result.success) {
    errors.push(...zodErrorToIssues(result.error, file));
    return { valid: false, errors, warnings };
  }

  // Semantic validations
  const config = result.data;

  // Check for empty hooks array
  const hookCount = Object.values(config.hooks).reduce(
    (sum, matchers) => sum + (matchers?.length ?? 0),
    0
  );
  if (hookCount === 0) {
    warnings.push({
      file,
      path: 'hooks',
      message: 'No hooks configured',
      severity: 'warning',
      suggestion: 'Add hook definitions under event names like StatusChange, LabelAdd, etc.',
    });
  }

  // Validate regex patterns in matchers
  for (const [event, matchers] of Object.entries(config.hooks)) {
    if (!matchers) continue;
    for (let i = 0; i < matchers.length; i++) {
      const matcher = matchers[i];
      if (matcher.matcher) {
        try {
          new RegExp(matcher.matcher);
        } catch (e) {
          errors.push({
            file,
            path: `hooks.${event}[${i}].matcher`,
            message: `Invalid regex pattern: ${e instanceof Error ? e.message : 'Unknown error'}`,
            severity: 'error',
            suggestion: 'Fix the regex pattern or remove the matcher to match all events',
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate hooks.json from workspace path (reads from disk).
 * Follows the same pattern as other validators in validators.ts.
 */
export function validateHooks(workspaceRoot: string): ValidationResult {
  const configPath = join(workspaceRoot, 'hooks.json');
  const file = 'hooks.json';

  // Hooks config is optional - no config means no hooks (valid state)
  if (!existsSync(configPath)) {
    return {
      valid: true,
      errors: [],
      warnings: [{
        file,
        path: '',
        message: 'hooks.json does not exist (no hooks configured)',
        severity: 'warning',
      }],
    };
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (e) {
    return {
      valid: false,
      errors: [{
        file,
        path: '',
        message: `Cannot read file: ${e instanceof Error ? e.message : 'Unknown error'}`,
        severity: 'error',
      }],
      warnings: [],
    };
  }

  return validateHooksContent(raw);
}

// ============================================================================
// Command Permission Rules (uses global permissions from Settings)
// ============================================================================

/**
 * Permissions context for checking commands
 */
let permissionsContext: PermissionsContext | null = null;
let permissionsConfig: MergedPermissionsConfig | null = null;

/**
 * Set the permissions context for command checking.
 * This loads the merged permissions from the global settings.
 */
export function setPermissionsContext(ctx: PermissionsContext): void {
  permissionsContext = ctx;
  permissionsConfig = permissionsConfigCache.getMergedConfig(ctx);
}

/**
 * Clear permissions context
 */
export function clearPermissionsContext(): void {
  permissionsContext = null;
  permissionsConfig = null;
}

/**
 * Check if a command is allowed using the global permission patterns.
 *
 * Uses the allowlist approach from Settings:
 * - Commands matching allowedBashPatterns are allowed
 * - Commands not matching any pattern are blocked
 */
export function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  // If no permissions config, allow all (permissive fallback for testing)
  if (!permissionsConfig) {
    return { allowed: true };
  }

  // Use the global bash permission checker
  const rejection = getBashRejectionReason(command, permissionsConfig);

  if (!rejection) {
    return { allowed: true };
  }

  // Command not in allowlist - format a helpful error message
  const reason = formatBashRejectionMessage(rejection, permissionsConfig);
  return { allowed: false, reason };
}

/**
 * Get the current permissions config (for debugging/display)
 */
export function getPermissionsConfig(): MergedPermissionsConfig | null {
  return permissionsConfig;
}

// ============================================================================
// State
// ============================================================================

let config: HooksConfig | null = null;
let context: { sessionId?: string; workspaceId?: string; workingDir?: string } = {};

// ============================================================================
// Init & Config
// ============================================================================

export interface InitHooksResult {
  success: boolean;
  errors: string[];
  hookCount: number;
}

/**
 * Initialize hooks from workspace
 */
export function initHooks(options: {
  workspaceRootPath: string;
  sessionId?: string;
  workspaceId?: string;
  workingDir?: string;
  /** Active source slugs for source-specific permission rules */
  activeSourceSlugs?: string[];
}): InitHooksResult {
  const configPath = join(options.workspaceRootPath, 'hooks.json');

  // Set up permissions context for command validation
  setPermissionsContext({
    workspaceRootPath: options.workspaceRootPath,
    activeSourceSlugs: options.activeSourceSlugs,
  });

  if (!existsSync(configPath)) {
    config = { hooks: {} };
    context = {
      sessionId: options.sessionId,
      workspaceId: options.workspaceId,
      workingDir: options.workingDir,
    };
    return { success: true, errors: [], hookCount: 0 };
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const validation = validateHooksConfig(raw);

    if (!validation.valid) {
      console.warn('[hooks] Invalid hooks.json:', validation.errors);
      config = { hooks: {} };
      context = {
        sessionId: options.sessionId,
        workspaceId: options.workspaceId,
        workingDir: options.workingDir,
      };
      return { success: false, errors: validation.errors, hookCount: 0 };
    }

    config = validation.config!;
    context = {
      sessionId: options.sessionId,
      workspaceId: options.workspaceId,
      workingDir: options.workingDir,
    };

    // Count total hooks
    const hookCount = Object.values(config.hooks).reduce(
      (sum, matchers) => sum + (matchers?.reduce((s, m) => s + m.hooks.length, 0) ?? 0),
      0
    );

    return { success: true, errors: [], hookCount };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    console.warn('[hooks] Failed to load hooks.json:', error);
    config = { hooks: {} };
    context = {
      sessionId: options.sessionId,
      workspaceId: options.workspaceId,
      workingDir: options.workingDir,
    };
    return { success: false, errors: [`Failed to parse JSON: ${error}`], hookCount: 0 };
  }
}

/**
 * Clear hooks (for cleanup/testing)
 */
export function clearHooks(): void {
  config = null;
  context = {};
  clearPermissionsContext();
}

/**
 * Check if event is an app event (vs agent event)
 */
export function isAppEvent(event: string): event is AppEvent {
  return APP_EVENTS.includes(event as AppEvent);
}

/**
 * Get agent hooks (to pass to Claude SDK)
 */
export function getAgentHooks(): Partial<Record<AgentEvent, HookMatcher[]>> {
  if (!config) return {};

  const result: Partial<Record<AgentEvent, HookMatcher[]>> = {};
  for (const event of AGENT_EVENTS) {
    if (config.hooks[event]) {
      result[event] = config.hooks[event];
    }
  }
  return result;
}

// ============================================================================
// Emit
// ============================================================================

/**
 * Emit a hook event
 *
 * @param event - Event name (e.g., 'StatusChange', 'LabelAdd')
 * @param data - Event-specific data (passed as env vars)
 * @returns HookResult with command results and pending prompts for Craft Agent
 */
export async function emitHook(
  event: HookEvent,
  data: Record<string, unknown>
): Promise<HookResult> {
  if (!config) {
    return { event, matched: 0, results: [], pendingPrompts: [] };
  }

  const matchers = config.hooks[event] ?? [];
  const matchValue = getMatchValue(event, data);

  // Find matching hooks
  const matchingHooks: HookDefinition[] = [];
  for (const m of matchers) {
    if (!m.matcher || new RegExp(m.matcher).test(matchValue)) {
      matchingHooks.push(...m.hooks);
    }
  }

  if (matchingHooks.length === 0) {
    return { event, matched: 0, results: [], pendingPrompts: [] };
  }

  // Build env vars (for command execution and prompt expansion)
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    CRAFT_EVENT: event,
    CRAFT_EVENT_DATA: JSON.stringify(data),
  };

  if (context.sessionId) env.CRAFT_SESSION_ID = context.sessionId;
  if (context.workspaceId) env.CRAFT_WORKSPACE_ID = context.workspaceId;
  if (context.workingDir) env.CRAFT_WORKING_DIR = context.workingDir;

  // Add data fields as individual env vars
  for (const [key, value] of Object.entries(data)) {
    env[`CRAFT_${toSnakeCase(key).toUpperCase()}`] = String(value);
  }

  // Separate command and prompt hooks
  const commandHooks = matchingHooks.filter((h): h is CommandHookDefinition => h.type === 'command');
  const promptHooks = matchingHooks.filter((h): h is PromptHookDefinition => h.type === 'prompt');

  // Validate: prompt hooks are only valid for App events
  if (promptHooks.length > 0 && !isAppEvent(event)) {
    console.warn(`[hooks] Prompt hooks are only supported for App events, ignoring ${promptHooks.length} prompt(s) for ${event}`);
  }

  // Execute command hooks in parallel (with permission check)
  const commandResults: HookExecutionResult[] = await Promise.all(
    commandHooks.map(async (hook) => {
      // Check if command is allowed
      const permission = isCommandAllowed(hook.command);
      if (!permission.allowed) {
        console.warn(`[hooks] Blocked command: ${hook.command} - ${permission.reason}`);
        return {
          type: 'command' as const,
          command: hook.command,
          success: false,
          stdout: '',
          stderr: permission.reason ?? 'Command blocked by security rules',
          blocked: true,
        };
      }

      try {
        const { stdout, stderr } = await execAsync(hook.command, {
          env,
          timeout: hook.timeout ?? 60000,
          cwd: context.workingDir,
          shell: '/bin/bash',
        });
        return {
          type: 'command' as const,
          command: hook.command,
          success: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        };
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        return {
          type: 'command' as const,
          command: hook.command,
          success: false,
          stdout: err.stdout?.trim() ?? '',
          stderr: err.stderr?.trim() ?? err.message ?? 'Unknown error',
        };
      }
    })
  );

  // Process prompt hooks (only for App events)
  const promptResults: HookExecutionResult[] = [];
  const pendingPrompts: PendingPrompt[] = [];

  if (isAppEvent(event)) {
    for (const hook of promptHooks) {
      // Expand environment variables in the prompt
      const expandedPrompt = expandEnvVars(hook.prompt, env);

      // Parse references to sources and skills
      const references = parsePromptReferences(expandedPrompt);

      promptResults.push({
        type: 'prompt',
        prompt: hook.prompt,
        expandedPrompt,
        references,
      });

      pendingPrompts.push({
        sessionId: context.sessionId,
        prompt: expandedPrompt,
        mentions: references.mentions,
      });
    }
  }

  return {
    event,
    matched: matchingHooks.length,
    results: [...commandResults, ...promptResults],
    pendingPrompts,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getMatchValue(event: HookEvent, data: Record<string, unknown>): string {
  switch (event) {
    case 'StatusChange':
      return String(data.newStatus ?? '');
    case 'LabelAdd':
    case 'LabelRemove':
      return String(data.label ?? '');
    case 'PermissionModeChange':
      return String(data.newMode ?? '');
    case 'PreToolUse':
    case 'PostToolUse':
      return String(data.toolName ?? '');
    default:
      return JSON.stringify(data);
  }
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Expand environment variables in a string.
 * Supports both $VAR and ${VAR} syntax.
 */
function expandEnvVars(str: string, env: Record<string, string>): string {
  return str
    // Replace ${VAR} syntax
    .replace(/\$\{([^}]+)\}/g, (_, varName) => env[varName] ?? '')
    // Replace $VAR syntax (word boundary)
    .replace(/\$([A-Z_][A-Z0-9_]*)/gi, (_, varName) => env[varName] ?? '');
}

/**
 * Parse @mentions from a prompt (sources and skills both use @name syntax).
 *
 * Syntax:
 * - @name - references a source or skill (e.g., @linear, @github, @commit, @review-pr)
 *
 * References are case-insensitive and support hyphens (e.g., @my-source, @my-skill).
 * The caller should resolve which mentions are sources vs skills based on available configurations.
 */
export function parsePromptReferences(prompt: string): PromptReferences {
  const mentions: string[] = [];

  // Match @name (word characters and hyphens)
  // Avoid matching email addresses by requiring whitespace or start of string before @
  const matches = prompt.matchAll(/(?:^|[\s(])@([a-zA-Z][a-zA-Z0-9-]*)/g);
  for (const match of matches) {
    const mention = match[1].toLowerCase();
    if (!mentions.includes(mention)) {
      mentions.push(mention);
    }
  }

  return { mentions };
}
