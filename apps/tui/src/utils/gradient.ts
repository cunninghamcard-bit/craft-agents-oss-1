/**
 * Gradient rendering for ultrathink display
 * Uses ANSI 256 colors for terminal compatibility
 */

// Symmetrical gradient: cyan → blue → magenta → blue → cyan
const ULTRATHINK_GRADIENT = [51, 45, 39, 129, 201, 201, 129, 39, 45, 51];

/**
 * Render text with ultrathink gradient coloring
 * Applies a symmetrical cyan→magenta→cyan gradient character by character
 * @param text The text to render with gradient
 * @param offset Optional offset to shift the gradient (for animation)
 */
export function renderUltrathinkGradient(text: string = 'ultrathink', offset: number = 0): string {
  return text
    .split('')
    .map((char, i) => `\x1b[38;5;${ULTRATHINK_GRADIENT[(i + offset) % ULTRATHINK_GRADIENT.length]}m${char}`)
    .join('') + '\x1b[0m';
}

/**
 * Check if a message contains the ultrathink keyword
 * Case-insensitive, matches word boundaries
 */
export function containsUltrathink(message: string): boolean {
  return /\bultrathink\b/i.test(message);
}

/**
 * Strip the ultrathink keyword from a message
 */
export function stripUltrathink(message: string): string {
  return message.replace(/\bultrathink\b/gi, '').trim();
}
