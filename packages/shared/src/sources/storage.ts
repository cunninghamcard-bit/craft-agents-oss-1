/**
 * Source Storage
 *
 * CRUD operations for workspace-scoped sources.
 * Sources are stored at ~/.craft-agent/workspaces/{workspaceSlug}/sources/{sourceSlug}/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  FolderSourceConfig,
  SourceGuide,
  LoadedSource,
  CreateSourceInput,
} from './types.ts';
import { validateSourceConfig } from '../config/validators.ts';
import { debug } from '../utils/debug.ts';
import { getWorkspaceSourcesPath, getWorkspaceAgentsPath } from '../workspaces/storage.ts';

// ============================================================
// Directory Utilities
// ============================================================

/**
 * Get path to a source folder within a workspace
 */
export function getSourcePath(workspaceSlug: string, sourceSlug: string): string {
  return join(getWorkspaceSourcesPath(workspaceSlug), sourceSlug);
}

/**
 * Get path to an agent-scoped source folder
 */
export function getAgentSourcePath(
  workspaceSlug: string,
  agentSlug: string,
  sourceSlug: string
): string {
  return join(getWorkspaceAgentsPath(workspaceSlug), agentSlug, 'sources', sourceSlug);
}

/**
 * Ensure sources directory exists for a workspace
 */
export function ensureSourcesDir(workspaceSlug: string): void {
  const dir = getWorkspaceSourcesPath(workspaceSlug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============================================================
// Config Operations
// ============================================================

/**
 * Load source config.json
 */
export function loadSourceConfig(
  workspaceSlug: string,
  sourceSlug: string
): FolderSourceConfig | null {
  const configPath = join(getSourcePath(workspaceSlug, sourceSlug), 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Load agent-scoped source config.json
 */
export function loadAgentSourceConfig(
  workspaceSlug: string,
  agentSlug: string,
  sourceSlug: string
): FolderSourceConfig | null {
  const configPath = join(getAgentSourcePath(workspaceSlug, agentSlug, sourceSlug), 'config.json');
  if (!existsSync(configPath)) return null;

  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Options for saveSourceConfig
 */
export interface SaveSourceConfigOptions {
  /** Skip validation (use for migrations or debugging only) */
  skipValidation?: boolean;
}

/**
 * Save source config.json
 * @throws Error if config is invalid (unless skipValidation is true)
 */
export function saveSourceConfig(
  workspaceSlug: string,
  config: FolderSourceConfig,
  options?: SaveSourceConfigOptions
): void {
  // Validate config before writing
  if (!options?.skipValidation) {
    const validation = validateSourceConfig(config);
    if (!validation.valid) {
      const errorMessages = validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
      debug('[saveSourceConfig] Validation failed:', errorMessages);
      throw new Error(`Invalid source config: ${errorMessages}`);
    }
  }

  const dir = getSourcePath(workspaceSlug, config.slug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  config.updatedAt = Date.now();
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2));
}

/**
 * Save agent-scoped source config.json
 */
export function saveAgentSourceConfig(
  workspaceSlug: string,
  agentSlug: string,
  config: FolderSourceConfig,
  options?: SaveSourceConfigOptions
): void {
  // Validate config before writing
  if (!options?.skipValidation) {
    const validation = validateSourceConfig(config);
    if (!validation.valid) {
      const errorMessages = validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
      debug('[saveAgentSourceConfig] Validation failed:', errorMessages);
      throw new Error(`Invalid source config: ${errorMessages}`);
    }
  }

  const dir = getAgentSourcePath(workspaceSlug, agentSlug, config.slug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  config.updatedAt = Date.now();
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2));
}

// ============================================================
// Guide Operations
// ============================================================

/**
 * Parse guide markdown with YAML frontmatter
 */
function parseGuideMarkdown(raw: string): SourceGuide {
  const guide: SourceGuide = { raw };

  // Extract YAML frontmatter
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (frontmatterMatch && frontmatterMatch[1]) {
    try {
      const frontmatter = parseYaml(frontmatterMatch[1]);
      if (frontmatter && typeof frontmatter === 'object' && 'cache' in frontmatter) {
        guide.cache = frontmatter.cache as Record<string, unknown>;
      }
    } catch {
      // Invalid YAML, ignore
    }
  }

  // Extract sections by headers
  const sectionRegex = /^## (Scope|Guidelines|Context|API Notes)\n([\s\S]*?)(?=\n## |\n---|\Z)/gim;
  let match;
  while ((match = sectionRegex.exec(raw)) !== null) {
    const sectionName = (match[1] ?? '').toLowerCase().replace(/\s+/g, '');
    const content = (match[2] ?? '').trim();

    switch (sectionName) {
      case 'scope':
        guide.scope = content;
        break;
      case 'guidelines':
        guide.guidelines = content;
        break;
      case 'context':
        guide.context = content;
        break;
      case 'apinotes':
        guide.apiNotes = content;
        break;
    }
  }

  return guide;
}

/**
 * Load and parse guide.md with frontmatter cache
 */
export function loadSourceGuide(workspaceSlug: string, sourceSlug: string): SourceGuide | null {
  const guidePath = join(getSourcePath(workspaceSlug, sourceSlug), 'guide.md');
  if (!existsSync(guidePath)) return null;

  try {
    const raw = readFileSync(guidePath, 'utf-8');
    return parseGuideMarkdown(raw);
  } catch {
    return null;
  }
}

/**
 * Load agent-scoped source guide
 */
export function loadAgentSourceGuide(
  workspaceSlug: string,
  agentSlug: string,
  sourceSlug: string
): SourceGuide | null {
  const guidePath = join(getAgentSourcePath(workspaceSlug, agentSlug, sourceSlug), 'guide.md');
  if (!existsSync(guidePath)) return null;

  try {
    const raw = readFileSync(guidePath, 'utf-8');
    return parseGuideMarkdown(raw);
  } catch {
    return null;
  }
}

/**
 * Save guide.md
 */
export function saveSourceGuide(
  workspaceSlug: string,
  sourceSlug: string,
  guide: SourceGuide
): void {
  const dir = getSourcePath(workspaceSlug, sourceSlug);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(join(dir, 'guide.md'), guide.raw);
}

/**
 * Update cache in guide.md frontmatter
 */
export function updateSourceCache(
  workspaceSlug: string,
  sourceSlug: string,
  updates: Record<string, unknown>
): void {
  const guide = loadSourceGuide(workspaceSlug, sourceSlug) || { raw: '' };
  const existingCache = guide.cache || {};
  const newCache = { ...existingCache, ...updates, lastUpdated: new Date().toISOString() };

  // Get content without frontmatter
  let content = guide.raw;
  content = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // Add new frontmatter
  const yamlCache = stringifyYaml({ cache: newCache });
  const newRaw = `---\n${yamlCache}---\n\n${content.trim()}\n`;

  saveSourceGuide(workspaceSlug, sourceSlug, { ...guide, raw: newRaw, cache: newCache });
}

/**
 * Set a nested value in an object using dot notation
 * e.g., setNestedValue({}, "projectIds.Backend", "123") -> { projectIds: { Backend: "123" } }
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }
  return obj;
}

// ============================================================
// Icon Operations
// ============================================================

/**
 * Find icon file (checks multiple extensions)
 */
export function findSourceIcon(workspaceSlug: string, sourceSlug: string): string | null {
  const dir = getSourcePath(workspaceSlug, sourceSlug);
  return findIconInDir(dir);
}

/**
 * Find icon in a specific directory
 */
export function findIconInDir(dir: string): string | null {
  const extensions = ['png', 'svg', 'jpg', 'jpeg', 'webp'];

  for (const ext of extensions) {
    const iconPath = join(dir, `icon.${ext}`);
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }

  return null;
}

// ============================================================
// Load Operations
// ============================================================

/**
 * Load complete source with all files
 */
export function loadSource(workspaceSlug: string, sourceSlug: string): LoadedSource | null {
  const config = loadSourceConfig(workspaceSlug, sourceSlug);
  if (!config) return null;

  return {
    config,
    guide: loadSourceGuide(workspaceSlug, sourceSlug),
    iconPath: findSourceIcon(workspaceSlug, sourceSlug),
    workspaceSlug,
  };
}

/**
 * Load agent-scoped source
 */
export function loadAgentSource(
  workspaceSlug: string,
  agentSlug: string,
  sourceSlug: string
): LoadedSource | null {
  const config = loadAgentSourceConfig(workspaceSlug, agentSlug, sourceSlug);
  if (!config) return null;

  const dir = getAgentSourcePath(workspaceSlug, agentSlug, sourceSlug);

  return {
    config,
    guide: loadAgentSourceGuide(workspaceSlug, agentSlug, sourceSlug),
    iconPath: findIconInDir(dir),
    workspaceSlug,
    agentSlug,
  };
}

/**
 * Load all sources for a workspace
 */
export function loadWorkspaceSources(workspaceSlug: string): LoadedSource[] {
  ensureSourcesDir(workspaceSlug);

  const sources: LoadedSource[] = [];
  const sourcesDir = getWorkspaceSourcesPath(workspaceSlug);

  if (!existsSync(sourcesDir)) return sources;

  const entries = readdirSync(sourcesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const source = loadSource(workspaceSlug, entry.name);
      if (source) {
        sources.push(source);
      }
    }
  }

  return sources;
}

/**
 * Load all agent-scoped sources
 */
export function loadAgentSources(workspaceSlug: string, agentSlug: string): LoadedSource[] {
  const sourcesDir = join(getWorkspaceAgentsPath(workspaceSlug), agentSlug, 'sources');

  if (!existsSync(sourcesDir)) return [];

  const sources: LoadedSource[] = [];
  const entries = readdirSync(sourcesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const source = loadAgentSource(workspaceSlug, agentSlug, entry.name);
      if (source) {
        sources.push(source);
      }
    }
  }

  return sources;
}

/**
 * Get enabled sources for a workspace
 */
export function getEnabledSources(workspaceSlug: string): LoadedSource[] {
  return loadWorkspaceSources(workspaceSlug).filter((s) => s.config.enabled);
}

/**
 * Get sources by slugs for a workspace
 */
export function getSourcesBySlugs(workspaceSlug: string, slugs: string[]): LoadedSource[] {
  const sources: LoadedSource[] = [];
  for (const slug of slugs) {
    const source = loadSource(workspaceSlug, slug);
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

// ============================================================
// Create/Delete Operations
// ============================================================

/**
 * Generate URL-safe slug from name
 */
export function generateSourceSlug(workspaceSlug: string, name: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Ensure slug is not empty
  if (!slug) {
    slug = 'source';
  }

  // Check for existing slugs and append number if needed
  const sourcesDir = getWorkspaceSourcesPath(workspaceSlug);
  const existingSlugs = new Set<string>();
  if (existsSync(sourcesDir)) {
    const entries = readdirSync(sourcesDir, { withFileTypes: true });
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
 * Create a new source in a workspace
 */
export function createSource(
  workspaceSlug: string,
  input: CreateSourceInput
): FolderSourceConfig {
  const slug = generateSourceSlug(workspaceSlug, input.name);
  const now = Date.now();

  const config: FolderSourceConfig = {
    id: `src_${randomUUID().slice(0, 8)}`,
    name: input.name,
    slug,
    enabled: input.enabled ?? true,
    provider: input.provider,
    type: input.type,
    createdAt: now,
    updatedAt: now,
  };

  // Add type-specific config
  switch (input.type) {
    case 'mcp':
      if (input.mcp) {
        config.mcp = input.mcp;
      }
      break;
    case 'api':
      if (input.api) {
        config.api = input.api;
      }
      break;
    case 'local':
      if (input.local) {
        config.local = input.local;
      }
      break;
  }

  saveSourceConfig(workspaceSlug, config);

  // Create default guide.md
  const guideContent = `# ${input.name}

## Guidelines

(Add usage guidelines here)

## Context

(Add context about this source)
`;
  saveSourceGuide(workspaceSlug, slug, { raw: guideContent });

  return config;
}

/**
 * Delete a source from a workspace
 */
export function deleteSource(workspaceSlug: string, sourceSlug: string): void {
  const dir = getSourcePath(workspaceSlug, sourceSlug);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
}

/**
 * Check if a source exists in a workspace
 */
export function sourceExists(workspaceSlug: string, sourceSlug: string): boolean {
  return existsSync(join(getSourcePath(workspaceSlug, sourceSlug), 'config.json'));
}

// ============================================================
// Re-export parseGuideMarkdown for use in agent folder storage
// ============================================================

export { parseGuideMarkdown };
