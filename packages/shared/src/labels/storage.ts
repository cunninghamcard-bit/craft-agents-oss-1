/**
 * Label Storage
 *
 * Filesystem-based storage for workspace label configurations.
 * Labels are stored at {workspaceRootPath}/labels/config.json
 * Icons are stored at labels/icons/{labelId}.{svg,png,jpg,jpeg}
 *
 * Hierarchy: Labels form a nested JSON tree. IDs are simple slugs.
 * Unlike statuses, labels have no defaults — workspaces start with an empty label set.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { WorkspaceLabelConfig, LabelConfig } from './types.ts';
import { flattenLabels, findLabelById } from './tree.ts';
import {
  downloadIcon,
  ICON_EXTENSIONS,
} from '../utils/icon.ts';
import { migrateLabelColors } from '../colors/migrate.ts';
import { debug } from '../utils/debug.ts';

const LABEL_CONFIG_DIR = 'labels';
const LABEL_CONFIG_FILE = 'labels/config.json';
// Icons stored flat in labels/icons/ subfolder, with labelId as filename
const LABEL_ICONS_DIR = 'labels/icons';

/**
 * Get default label configuration (empty — no built-in labels)
 */
export function getDefaultLabelConfig(): WorkspaceLabelConfig {
  return {
    version: 1,
    labels: [],
  };
}

/**
 * Load workspace label configuration.
 * Returns empty config if no file exists or parsing fails.
 * Auto-migrates old Tailwind color format to EntityColor on first load.
 */
export function loadLabelConfig(workspaceRootPath: string): WorkspaceLabelConfig {
  const configPath = join(workspaceRootPath, LABEL_CONFIG_FILE);

  if (!existsSync(configPath)) {
    return getDefaultLabelConfig();
  }

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as WorkspaceLabelConfig;

    // Auto-migrate old Tailwind class colors (e.g., "text-accent") to new EntityColor format.
    // If migration occurs, write the updated config back to disk.
    const migrated = migrateLabelColors(config);
    if (migrated) {
      debug('[loadLabelConfig] Migrated old color format, writing back');
      saveLabelConfig(workspaceRootPath, config);
    }

    return config;
  } catch (error) {
    debug('[loadLabelConfig] Failed to parse config:', error);
    return getDefaultLabelConfig();
  }
}

/**
 * Save workspace label configuration to disk.
 * Creates the labels directory if missing.
 */
export function saveLabelConfig(
  workspaceRootPath: string,
  config: WorkspaceLabelConfig
): void {
  const labelDir = join(workspaceRootPath, LABEL_CONFIG_DIR);
  const configPath = join(workspaceRootPath, LABEL_CONFIG_FILE);

  if (!existsSync(labelDir)) {
    mkdirSync(labelDir, { recursive: true });
  }

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    debug('[saveLabelConfig] Failed to save config:', error);
    throw error;
  }
}

/**
 * Get the label tree (root-level labels with nested children).
 * Primary accessor for the UI — returns the tree structure as-is from config.
 */
export function listLabels(workspaceRootPath: string): LabelConfig[] {
  const config = loadLabelConfig(workspaceRootPath);
  return config.labels;
}

/**
 * Get all labels as a flat list (tree flattened depth-first).
 * Useful for lookups, session label validation, and non-hierarchical display.
 */
export function listLabelsFlat(workspaceRootPath: string): LabelConfig[] {
  const config = loadLabelConfig(workspaceRootPath);
  return flattenLabels(config.labels);
}

/**
 * Get a single label by ID (searches the entire tree).
 * Returns null if not found.
 */
export function getLabel(
  workspaceRootPath: string,
  labelId: string
): LabelConfig | null {
  const config = loadLabelConfig(workspaceRootPath);
  return findLabelById(config.labels, labelId) || null;
}

/**
 * Check if a label ID exists in this workspace (searches entire tree)
 */
export function isValidLabelId(
  workspaceRootPath: string,
  labelId: string
): boolean {
  const config = loadLabelConfig(workspaceRootPath);
  return !!findLabelById(config.labels, labelId);
}

/**
 * Validate label ID format.
 * Simple slug: lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 * Examples: "bug", "frontend", "my-label"
 */
export function isValidLabelIdFormat(labelId: string): boolean {
  if (!labelId) return false;
  const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  return SLUG_PATTERN.test(labelId);
}

// ============================================================
// Icon Operations (uses shared utilities from utils/icon.ts)
// ============================================================

/**
 * Find icon file for a label.
 * Looks for labels/icons/{labelId}.{svg,png,jpg,jpeg}
 * Label IDs are simple slugs — always filesystem-safe.
 * Returns absolute path to icon file or undefined.
 */
export function findLabelIcon(
  workspaceRootPath: string,
  labelId: string
): string | undefined {
  const iconsDir = join(workspaceRootPath, LABEL_ICONS_DIR);

  for (const ext of ICON_EXTENSIONS) {
    const iconPath = join(iconsDir, `${labelId}${ext}`);
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }
  return undefined;
}

/**
 * Download an icon from a URL and save it to labels/icons/{labelId}.{ext}.
 * Returns the path to the downloaded icon, or null on failure.
 */
export async function downloadLabelIcon(
  workspaceRootPath: string,
  labelId: string,
  iconUrl: string
): Promise<string | null> {
  const iconsDir = join(workspaceRootPath, LABEL_ICONS_DIR);

  // Ensure icons directory exists
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }

  // Download icon with labelId as the filename prefix
  const downloadedPath = await downloadIcon(iconsDir, iconUrl, 'Labels', labelId);
  if (!downloadedPath) return null;

  debug(`[downloadLabelIcon] Icon saved for ${labelId}: ${downloadedPath}`);
  return downloadedPath;
}

// Re-export icon utilities for convenience
export { isIconUrl } from '../utils/icon.ts';
