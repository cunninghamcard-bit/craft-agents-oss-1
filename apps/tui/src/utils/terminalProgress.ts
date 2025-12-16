/**
 * Terminal progress indicator support via OSC 9;4 sequences.
 * Works with: Ghostty, iTerm2, Kitty, Windows Terminal, ConEmu
 * Terminals that don't support this will simply ignore the sequences.
 */

/**
 * Set terminal progress to a specific percentage (0-100)
 */
export function setTerminalProgress(percent: number): void {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  process.stdout.write(`\x1b]9;4;1;${clamped}\x07`);
}

/**
 * Set terminal progress to indeterminate (pulsing) mode
 */
export function setTerminalProgressIndeterminate(): void {
  process.stdout.write(`\x1b]9;4;3\x07`);
}

/**
 * Clear/remove terminal progress indicator
 */
export function clearTerminalProgress(): void {
  process.stdout.write(`\x1b]9;4;0\x07`);
}
