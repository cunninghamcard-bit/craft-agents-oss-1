/**
 * Context usage visualization formatter
 *
 * Displays context window usage similar to Claude Code's /context command.
 */

import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';

const FILLED = '⛁';
const EMPTY = '⛶';
const BUFFER = '⛝';

// Bright colors for dark terminal backgrounds
const COLOR_USED = '#a855f7';        // Bright purple
const COLOR_FREE = '#6b7280';        // Medium gray
const COLOR_BUFFER = '#f59e0b';      // Amber/orange
const COLOR_CACHE_READ = '#22c55e';  // Green (cheap - 0.1x)
const COLOR_CACHE_WRITE = '#eab308'; // Yellow (expensive - 1.25x)
const COLOR_UNCACHED = '#3b82f6';    // Blue
const COLOR_OUTPUT = '#ec4899';      // Pink (assistant responses)

export interface ContextDisplayInput {
  model: string;
  contextWindow: number;
  autocompactBuffer: number;
  totalUsed: number;
  transcriptPath?: string;  // Path to SDK session jsonl file
}

interface ContextBreakdown {
  cacheRead: number;      // Tokens read from cache (cheap)
  cacheCreate: number;    // Tokens written to cache (expensive)
  uncached: number;       // New tokens not in cache
  output: number;         // Output tokens (assistant responses)
  totalInput: number;     // Actual current context size (last call's input)
}

/**
 * Format context usage for terminal display
 */
export function formatContextDisplay(input: ContextDisplayInput): string {
  const { model, contextWindow, autocompactBuffer, totalUsed, transcriptPath } = input;

  // Try to get detailed breakdown from SDK session transcript
  const breakdown = transcriptPath ? getContextBreakdown(transcriptPath) : null;

  // Use breakdown's totalInput if available (accurate current context size),
  // otherwise fall back to passed totalUsed (which may be cumulative/inaccurate)
  const actualUsed = breakdown?.totalInput ?? totalUsed;

  const freeSpace = Math.max(0, contextWindow - actualUsed - autocompactBuffer);
  const percentUsed = Math.round((actualUsed / contextWindow) * 100);
  const percentFree = Math.round((freeSpace / contextWindow) * 100);
  const percentBuffer = Math.round((autocompactBuffer / contextWindow) * 100);

  const lines: string[] = [];

  // Header
  lines.push(chalk.bold('Context Usage'));

  // Build grid with legend on the right
  const gridRows = buildVisualGridRows(actualUsed, autocompactBuffer, contextWindow, breakdown);

  // Legend items to show on the right side
  const legendItems = breakdown ? [
    `${chalk.hex(COLOR_CACHE_READ)(FILLED)} Cache read: ${formatTokens(breakdown.cacheRead)} ${chalk.gray('(sys prompt, tools, history)')}`,
    `${chalk.hex(COLOR_CACHE_WRITE)(FILLED)} Cache write: ${formatTokens(breakdown.cacheCreate)} ${chalk.gray('(new additions to cache)')}`,
    `${chalk.hex(COLOR_UNCACHED)(FILLED)} Uncached: ${formatTokens(breakdown.uncached)}`,
    `${chalk.hex(COLOR_FREE)(EMPTY)} Free: ${formatTokens(freeSpace)} (${percentFree}%)`,
    `${chalk.hex(COLOR_BUFFER)(BUFFER)} Buffer: ${formatTokens(autocompactBuffer)} (${percentBuffer}%)`,
    `${chalk.hex(COLOR_OUTPUT)('→')} Output: ${formatTokens(breakdown.output)} ${chalk.gray('(added next turn)')}`,
  ] : [
    `${chalk.hex(COLOR_USED)(FILLED)} Used: ${formatTokens(actualUsed)} (${percentUsed}%)`,
    `${chalk.hex(COLOR_FREE)(EMPTY)} Free: ${formatTokens(freeSpace)} (${percentFree}%)`,
    `${chalk.hex(COLOR_BUFFER)(BUFFER)} Buffer: ${formatTokens(autocompactBuffer)} (${percentBuffer}%)`,
  ];

  // Combine grid rows with legend
  for (let i = 0; i < gridRows.length; i++) {
    const legendItem = legendItems[i] || '';
    lines.push(`${gridRows[i]}  ${legendItem}`);
  }

  // Summary line
  lines.push('');
  const usedK = (actualUsed / 1000).toFixed(0);
  const totalK = (contextWindow / 1000).toFixed(0);
  lines.push(`${chalk.gray(model)} · ${usedK}k/${totalK}k tokens (${percentUsed}%)`);

  return lines.join('\n');
}

/**
 * Build visual grid rows (without joining)
 */
function buildVisualGridRows(
  used: number,
  buffer: number,
  total: number,
  breakdown: ContextBreakdown | null
): string[] {
  const bufferPercent = Math.round((buffer / total) * 100);

  // Calculate percentage thresholds for each category
  // Note: Output is NOT included in grid - it's informational only (will be added to next turn)
  let cacheReadPercent = 0;
  let cacheWritePercent = 0;
  let uncachedPercent = 0;
  const usedPercent = Math.round((used / total) * 100);

  if (breakdown) {
    // Only show input tokens in grid (cache read + cache write + uncached = totalInput)
    cacheReadPercent = Math.round((breakdown.cacheRead / total) * 100);
    cacheWritePercent = Math.round((breakdown.cacheCreate / total) * 100);
    uncachedPercent = Math.round((breakdown.uncached / total) * 100);
  }

  const rows: string[] = [];
  let cellIndex = 0;

  for (let row = 0; row < 10; row++) {
    let rowStr = '';
    for (let col = 0; col < 10; col++) {
      const cell = cellIndex;
      cellIndex++;

      if (breakdown) {
        // Show breakdown colors: cache read -> cache write -> uncached -> free -> buffer
        // (Output is shown in legend only - it's not part of current context)
        if (cell < cacheReadPercent) {
          rowStr += chalk.hex(COLOR_CACHE_READ)(FILLED) + ' ';
        } else if (cell < cacheReadPercent + cacheWritePercent) {
          rowStr += chalk.hex(COLOR_CACHE_WRITE)(FILLED) + ' ';
        } else if (cell < cacheReadPercent + cacheWritePercent + uncachedPercent) {
          rowStr += chalk.hex(COLOR_UNCACHED)(FILLED) + ' ';
        } else if (cell < 100 - bufferPercent) {
          rowStr += chalk.hex(COLOR_FREE)(EMPTY) + ' ';
        } else {
          rowStr += chalk.hex(COLOR_BUFFER)(BUFFER) + ' ';
        }
      } else {
        // Fallback: single color for used
        if (cell < usedPercent) {
          rowStr += chalk.hex(COLOR_USED)(FILLED) + ' ';
        } else if (cell < 100 - bufferPercent) {
          rowStr += chalk.hex(COLOR_FREE)(EMPTY) + ' ';
        } else {
          rowStr += chalk.hex(COLOR_BUFFER)(BUFFER) + ' ';
        }
      }
    }
    rows.push(rowStr);
  }

  return rows;
}

/**
 * Get context breakdown from SDK session jsonl file
 *
 * Uses the last turn's input breakdown (cache read/write/uncached) plus
 * cumulative output tokens (assistant responses become part of context).
 */
function getContextBreakdown(transcriptPath: string): ContextBreakdown | null {
  try {
    if (!existsSync(transcriptPath)) {
      return null;
    }

    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Track last turn's breakdown (input AND output)
    // Previous output is already absorbed into cache_read on subsequent turns
    let lastCacheRead = 0;
    let lastCacheCreate = 0;
    let lastUncached = 0;
    let lastOutput = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Look for assistant messages with usage data
        if (entry.type === 'assistant' && entry.message?.usage) {
          const usage = entry.message.usage;
          // Update to last turn's values (not cumulative)
          lastCacheRead = usage.cache_read_input_tokens || 0;
          lastCacheCreate = usage.cache_creation_input_tokens || 0;
          lastUncached = usage.input_tokens || 0;
          lastOutput = usage.output_tokens || 0;
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (lastCacheRead === 0 && lastCacheCreate === 0 && lastUncached === 0 && lastOutput === 0) {
      return null;
    }

    return {
      cacheRead: lastCacheRead,
      cacheCreate: lastCacheCreate,
      uncached: lastUncached,
      output: lastOutput,
      totalInput: lastCacheRead + lastCacheCreate + lastUncached,
    };
  } catch {
    return null;
  }
}

/**
 * Format token count for display (e.g., "114.2k tokens" or "500 tokens")
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return `${tokens}`;
}
