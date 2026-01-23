/**
 * Label Types
 *
 * Types for configurable session labels.
 * Labels are additive tags (many-per-session), unlike statuses which are exclusive (one-per-session).
 * Stored at {workspaceRootPath}/labels/config.json
 *
 * Hierarchy: Labels form a recursive JSON tree via the `children` array.
 * Array position determines display order (no separate order field).
 * IDs are simple slugs, globally unique across the entire tree.
 *
 * Icon format: emoji, URL, or explicit local file path.
 * - Emoji: "🏷️" - rendered as text
 * - URL: "https://..." - auto-downloaded to labels/icons/{labelId}.{ext}
 * - Local path: "labels/icons/my-icon.svg" - explicit relative path
 * - Omit for no icon (many labels won't have one)
 *
 * Color format: EntityColor (system color string or custom color object)
 * - System: "accent", "foreground/50", "info/80" (uses CSS variables, auto light/dark)
 * - Custom: { light: "#EF4444", dark: "#F87171" } (explicit values)
 */

import type { EntityColor } from '../colors/types.ts'

/**
 * Label configuration (stored in labels/config.json).
 * Recursive: each label can have nested children forming a tree.
 * Array position = display order (no explicit order field needed).
 */
export interface LabelConfig {
  /** Unique ID — simple slug, globally unique across the tree (e.g., 'bug', 'frontend') */
  id: string;

  /** Display name */
  name: string;

  /** Optional color. Cascades into colorable SVGs via currentColor. */
  color?: EntityColor;

  /**
   * Icon: emoji, URL (auto-downloaded), or explicit local file path.
   * Omit for no icon.
   */
  icon?: string;

  /** Child labels forming a sub-tree. Array position = display order. */
  children?: LabelConfig[];

  /**
   * Optional value type hint for UI rendering and agent affordances.
   * When set, indicates this label carries a typed value (e.g., "priority::3").
   * Parser always infers the type from raw value, but this hint tells UI
   * what input widget to show and tells the agent what format to write.
   * Omit for boolean (presence-only) labels.
   */
  valueType?: 'string' | 'number' | 'date';
}

/**
 * Complete label configuration for a workspace
 */
export interface WorkspaceLabelConfig {
  /** Schema version (start at 1) */
  version: number;

  /** Root-level labels. Array position = display order. May contain nested children. */
  labels: LabelConfig[];
}

/**
 * Input for creating a new label (via CRUD operations).
 * parentId determines where in the tree to insert (null/undefined = root level).
 */
export interface CreateLabelInput {
  name: string;
  color?: EntityColor;
  icon?: string; // Emoji, URL, or local path
  parentId?: string; // Target parent label ID (null = root)
  valueType?: 'string' | 'number' | 'date';
}

/**
 * Input for updating an existing label (name, color, icon, valueType — cannot change ID or hierarchy)
 */
export interface UpdateLabelInput {
  name?: string;
  color?: EntityColor;
  icon?: string; // Emoji, URL, or local path
  valueType?: 'string' | 'number' | 'date';
}

/**
 * Parsed session label entry (after splitting on ::).
 * Session labels are stored as flat strings like "bug" or "priority::3".
 * This interface represents the parsed form for typed access.
 */
export interface ParsedLabelEntry {
  /** Label ID (the part before ::, or the entire string for boolean labels) */
  id: string;

  /** Raw string value (the part after ::), undefined for boolean labels */
  rawValue?: string;

  /**
   * Typed value inferred from rawValue:
   * - number: if rawValue parses as a finite number
   * - Date: if rawValue matches ISO date format (YYYY-MM-DD)
   * - string: otherwise
   * - undefined: for boolean labels (no :: separator)
   */
  value?: string | number | Date;
}
