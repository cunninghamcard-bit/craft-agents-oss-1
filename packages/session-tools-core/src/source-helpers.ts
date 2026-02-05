/**
 * Session Tools Core - Source Helpers
 *
 * Utilities for loading and working with source configurations.
 * These are standalone functions that don't depend on the full
 * packages/shared infrastructure.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceConfig } from './types.ts';

/**
 * Get the path to a source's directory
 */
export function getSourcePath(workspaceRootPath: string, sourceSlug: string): string {
  return join(workspaceRootPath, 'sources', sourceSlug);
}

/**
 * Get the path to a source's config.json
 */
export function getSourceConfigPath(workspaceRootPath: string, sourceSlug: string): string {
  return join(getSourcePath(workspaceRootPath, sourceSlug), 'config.json');
}

/**
 * Get the path to a source's guide.md
 */
export function getSourceGuidePath(workspaceRootPath: string, sourceSlug: string): string {
  return join(getSourcePath(workspaceRootPath, sourceSlug), 'guide.md');
}

/**
 * Check if a source directory exists
 */
export function sourceExists(workspaceRootPath: string, sourceSlug: string): boolean {
  return existsSync(getSourcePath(workspaceRootPath, sourceSlug));
}

/**
 * Check if a source config file exists
 */
export function sourceConfigExists(workspaceRootPath: string, sourceSlug: string): boolean {
  return existsSync(getSourceConfigPath(workspaceRootPath, sourceSlug));
}

/**
 * Load a source configuration from disk.
 * Returns null if the config doesn't exist or is invalid.
 */
export function loadSourceConfig(
  workspaceRootPath: string,
  sourceSlug: string
): SourceConfig | null {
  const configPath = getSourceConfigPath(workspaceRootPath, sourceSlug);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as SourceConfig;
    return config;
  } catch {
    return null;
  }
}

/**
 * List all source slugs in a workspace
 */
export function listSourceSlugs(workspaceRootPath: string): string[] {
  const sourcesDir = join(workspaceRootPath, 'sources');

  if (!existsSync(sourcesDir)) {
    return [];
  }

  try {
    const entries = readdirSync(sourcesDir);
    return entries.filter((entry) => {
      const entryPath = join(sourcesDir, entry);
      return statSync(entryPath).isDirectory();
    });
  } catch {
    return [];
  }
}

/**
 * Get the path to a skill's directory
 */
export function getSkillPath(workspaceRootPath: string, skillSlug: string): string {
  return join(workspaceRootPath, 'skills', skillSlug);
}

/**
 * Get the path to a skill's SKILL.md file
 */
export function getSkillMdPath(workspaceRootPath: string, skillSlug: string): string {
  return join(getSkillPath(workspaceRootPath, skillSlug), 'SKILL.md');
}

/**
 * Check if a skill directory exists
 */
export function skillExists(workspaceRootPath: string, skillSlug: string): boolean {
  return existsSync(getSkillPath(workspaceRootPath, skillSlug));
}

/**
 * Check if a skill's SKILL.md file exists
 */
export function skillMdExists(workspaceRootPath: string, skillSlug: string): boolean {
  return existsSync(getSkillMdPath(workspaceRootPath, skillSlug));
}

/**
 * List all skill slugs in a workspace
 */
export function listSkillSlugs(workspaceRootPath: string): string[] {
  const skillsDir = join(workspaceRootPath, 'skills');

  if (!existsSync(skillsDir)) {
    return [];
  }

  try {
    const entries = readdirSync(skillsDir);
    return entries.filter((entry) => {
      const entryPath = join(skillsDir, entry);
      return statSync(entryPath).isDirectory();
    });
  } catch {
    return [];
  }
}

/**
 * Generate a unique request ID for auth requests
 */
export function generateRequestId(prefix: string = 'req'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
