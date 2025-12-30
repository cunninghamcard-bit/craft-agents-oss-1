/**
 * Safe Mode Configuration
 *
 * Allows customization of Safe Mode rules per workspace and per source.
 * Users can create safe-mode.md files to extend the default rules.
 *
 * File locations:
 * - Workspace: ~/.craft-agent/workspaces/{slug}/safe-mode.md
 * - Per-source: ~/.craft-agent/workspaces/{slug}/sources/{sourceSlug}/safe-mode.md
 *
 * Rules are additive - custom configs extend the defaults (more permissive).
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { debug } from '../utils/debug.ts';
import { getWorkspacePath } from '../workspaces/storage.ts';
import { getSourcePath } from '../sources/storage.ts';
import { MODE_CONFIGS } from './mode-manager.ts';

// ============================================================
// Types
// ============================================================

/**
 * Parsed safe mode configuration from markdown file
 */
export interface SafeModeCustomConfig {
  /** Additional tools to block */
  blockedTools: string[];
  /** Additional bash patterns to allow (as regex strings) */
  allowedBashPatterns: string[];
  /** Additional MCP patterns to allow (as regex strings) */
  allowedMcpPatterns: string[];
  /** Additional API methods to allow */
  allowedApiMethods: string[];
}

/**
 * Merged safe mode config for runtime use
 */
export interface MergedSafeModeConfig {
  blockedTools: Set<string>;
  readOnlyBashPatterns: RegExp[];
  readOnlyMcpPatterns: RegExp[];
  readOnlyApiMethods: Set<string>;
  /** Display name for error messages */
  displayName: string;
  /** Keyboard shortcut hint */
  shortcutHint: string;
}

/**
 * Context for safe mode checking (includes workspace/source info)
 */
export interface SafeModeContext {
  workspaceSlug: string;
  /** Active source slugs for source-specific rules */
  activeSourceSlugs?: string[];
}

// ============================================================
// Markdown Parser
// ============================================================

/**
 * Parse safe-mode.md file into structured config
 *
 * Expected format:
 * ```markdown
 * # Safe Mode Configuration
 *
 * ## Blocked Tools
 * - `ToolName`
 *
 * ## Allowed Bash Patterns
 * - `^pattern\b` - optional comment
 *
 * ## Allowed MCP Patterns
 * - `pattern`
 *
 * ## Allowed API Methods
 * - `HEAD`
 * ```
 */
export function parseSafeModeMarkdown(content: string): SafeModeCustomConfig {
  const config: SafeModeCustomConfig = {
    blockedTools: [],
    allowedBashPatterns: [],
    allowedMcpPatterns: [],
    allowedApiMethods: [],
  };

  // Split into sections by ## headings
  const sections = content.split(/^##\s+/m);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const firstLine = lines[0];
    if (!firstLine) continue;

    const heading = firstLine.toLowerCase().trim();

    // Extract list items from the section
    const items = extractListItems(lines.slice(1));

    if (heading.includes('blocked tools')) {
      config.blockedTools = items;
    } else if (heading.includes('allowed bash patterns')) {
      config.allowedBashPatterns = items;
    } else if (heading.includes('allowed mcp patterns')) {
      config.allowedMcpPatterns = items;
    } else if (heading.includes('allowed api methods')) {
      config.allowedApiMethods = items;
    }
  }

  return config;
}

/**
 * Extract list items from markdown lines
 * Handles: - `pattern` - comment, - pattern, - `pattern`
 */
function extractListItems(lines: string[]): string[] {
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Match list item: - `pattern` or - pattern
    const match = trimmed.match(/^-\s+`?([^`]+)`?(?:\s+-.*)?$/);
    if (match?.[1]) {
      const item = match[1].trim();
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

// ============================================================
// Storage Functions
// ============================================================

/**
 * Get path to workspace safe-mode.md
 */
export function getWorkspaceSafeModePath(workspaceSlug: string): string {
  return join(getWorkspacePath(workspaceSlug), 'safe-mode.md');
}

/**
 * Get path to source safe-mode.md
 */
export function getSourceSafeModePath(workspaceSlug: string, sourceSlug: string): string {
  return join(getSourcePath(workspaceSlug, sourceSlug), 'safe-mode.md');
}

/**
 * Load workspace-level safe mode config
 */
export function loadWorkspaceSafeModeConfig(workspaceSlug: string): SafeModeCustomConfig | null {
  const path = getWorkspaceSafeModePath(workspaceSlug);
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, 'utf-8');
    const config = parseSafeModeMarkdown(content);
    debug(`[SafeMode] Loaded workspace config from ${path}:`, config);
    return config;
  } catch (error) {
    debug(`[SafeMode] Error loading workspace config:`, error);
    return null;
  }
}

/**
 * Load source-level safe mode config
 */
export function loadSourceSafeModeConfig(
  workspaceSlug: string,
  sourceSlug: string
): SafeModeCustomConfig | null {
  const path = getSourceSafeModePath(workspaceSlug, sourceSlug);
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, 'utf-8');
    const config = parseSafeModeMarkdown(content);
    debug(`[SafeMode] Loaded source config from ${path}:`, config);
    return config;
  } catch (error) {
    debug(`[SafeMode] Error loading source config:`, error);
    return null;
  }
}

// ============================================================
// Config Cache
// ============================================================

/**
 * In-memory cache for parsed safe mode configs
 * Invalidated on file changes via ConfigWatcher
 */
class SafeModeConfigCache {
  private workspaceConfigs: Map<string, SafeModeCustomConfig | null> = new Map();
  private sourceConfigs: Map<string, SafeModeCustomConfig | null> = new Map();
  private mergedConfigs: Map<string, MergedSafeModeConfig> = new Map();

  /**
   * Get or load workspace config
   */
  getWorkspaceConfig(workspaceSlug: string): SafeModeCustomConfig | null {
    if (!this.workspaceConfigs.has(workspaceSlug)) {
      this.workspaceConfigs.set(workspaceSlug, loadWorkspaceSafeModeConfig(workspaceSlug));
    }
    return this.workspaceConfigs.get(workspaceSlug) ?? null;
  }

  /**
   * Get or load source config
   */
  getSourceConfig(workspaceSlug: string, sourceSlug: string): SafeModeCustomConfig | null {
    const key = `${workspaceSlug}::${sourceSlug}`;
    if (!this.sourceConfigs.has(key)) {
      this.sourceConfigs.set(key, loadSourceSafeModeConfig(workspaceSlug, sourceSlug));
    }
    return this.sourceConfigs.get(key) ?? null;
  }

  /**
   * Invalidate workspace config (called by ConfigWatcher)
   */
  invalidateWorkspace(workspaceSlug: string): void {
    debug(`[SafeMode] Invalidating workspace config: ${workspaceSlug}`);
    this.workspaceConfigs.delete(workspaceSlug);
    // Clear all merged configs for this workspace
    for (const key of this.mergedConfigs.keys()) {
      if (key.startsWith(`${workspaceSlug}::`)) {
        this.mergedConfigs.delete(key);
      }
    }
  }

  /**
   * Invalidate source config (called by ConfigWatcher)
   */
  invalidateSource(workspaceSlug: string, sourceSlug: string): void {
    debug(`[SafeMode] Invalidating source config: ${workspaceSlug}/${sourceSlug}`);
    this.sourceConfigs.delete(`${workspaceSlug}::${sourceSlug}`);
    // Clear merged configs that include this source
    for (const key of this.mergedConfigs.keys()) {
      if (key.startsWith(`${workspaceSlug}::`) && key.includes(sourceSlug)) {
        this.mergedConfigs.delete(key);
      }
    }
  }

  /**
   * Get merged config for a context (workspace + active sources)
   * Uses additive merging: custom configs extend defaults
   */
  getMergedConfig(context: SafeModeContext): MergedSafeModeConfig {
    const cacheKey = this.buildCacheKey(context);

    if (!this.mergedConfigs.has(cacheKey)) {
      const merged = this.buildMergedConfig(context);
      this.mergedConfigs.set(cacheKey, merged);
    }

    return this.mergedConfigs.get(cacheKey)!;
  }

  private buildMergedConfig(context: SafeModeContext): MergedSafeModeConfig {
    const defaults = MODE_CONFIGS.safe;

    // Start with defaults
    const merged: MergedSafeModeConfig = {
      blockedTools: new Set(defaults.blockedTools),
      readOnlyBashPatterns: [...defaults.readOnlyBashPatterns],
      readOnlyMcpPatterns: [...defaults.readOnlyMcpPatterns],
      readOnlyApiMethods: new Set(defaults.readOnlyApiMethods),
      displayName: defaults.displayName,
      shortcutHint: defaults.shortcutHint,
    };

    // Add workspace-level customizations
    const wsConfig = this.getWorkspaceConfig(context.workspaceSlug);
    if (wsConfig) {
      this.applyCustomConfig(merged, wsConfig);
    }

    // Add source-level customizations (additive)
    if (context.activeSourceSlugs) {
      for (const sourceSlug of context.activeSourceSlugs) {
        const srcConfig = this.getSourceConfig(context.workspaceSlug, sourceSlug);
        if (srcConfig) {
          this.applyCustomConfig(merged, srcConfig);
        }
      }
    }

    return merged;
  }

  private applyCustomConfig(merged: MergedSafeModeConfig, custom: SafeModeCustomConfig): void {
    // Add blocked tools
    for (const tool of custom.blockedTools) {
      merged.blockedTools.add(tool);
    }

    // Add allowed bash patterns (making config more permissive)
    for (const pattern of custom.allowedBashPatterns) {
      try {
        merged.readOnlyBashPatterns.push(new RegExp(pattern));
      } catch {
        debug(`[SafeMode] Invalid bash pattern, skipping: ${pattern}`);
      }
    }

    // Add allowed MCP patterns
    for (const pattern of custom.allowedMcpPatterns) {
      try {
        merged.readOnlyMcpPatterns.push(new RegExp(pattern));
      } catch {
        debug(`[SafeMode] Invalid MCP pattern, skipping: ${pattern}`);
      }
    }

    // Add allowed API methods
    for (const method of custom.allowedApiMethods) {
      merged.readOnlyApiMethods.add(method.toUpperCase());
    }
  }

  private buildCacheKey(context: SafeModeContext): string {
    const sources = context.activeSourceSlugs?.sort().join(',') ?? '';
    return `${context.workspaceSlug}::${sources}`;
  }

  /**
   * Clear all cached configs
   */
  clear(): void {
    this.workspaceConfigs.clear();
    this.sourceConfigs.clear();
    this.mergedConfigs.clear();
  }
}

// Singleton instance
export const safeModeConfigCache = new SafeModeConfigCache();
