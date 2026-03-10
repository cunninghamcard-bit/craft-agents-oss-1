/**
 * Session title generation utilities.
 *
 * Shared helpers for building title prompts and validating results.
 * Actual title generation is handled by agent classes using their respective SDKs:
 * - ClaudeAgent: Uses Claude SDK query()
 * - CodexAgent: Uses OpenAI SDK
 */

/** Slice text at the last word boundary within `max` characters. */
function sliceAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const lastSpace = text.lastIndexOf(' ', max);
  return lastSpace > 0 ? text.slice(0, lastSpace) : text.slice(0, max);
}

/**
 * Build a language instruction for title prompts.
 * Explicit preference takes priority; otherwise auto-detect from message content.
 */
function buildLanguageInstruction(language?: string): string {
  if (language) {
    return `Reply in ${language}.`;
  }
  return 'Reply in the same language as the user\'s messages.';
}

/**
 * Build a prompt for generating a session title from a user message.
 *
 * @param message - The user's message to generate a title from
 * @param options.language - Preferred language for the title
 * @returns Formatted prompt string
 */
export function buildTitlePrompt(message: string, options?: { language?: string }): string {
  const snippet = sliceAtWord(message, 500);
  return [
    'What topic or area is the user exploring? Reply with ONLY a short descriptive title (2-5 words).',
    'Use a short descriptive label. Use plain text only - no markdown.',
    buildLanguageInstruction(options?.language),
    'Examples: "Auto Title Generation", "Dark Mode Support", "Fix API Authentication", "Database Schema Design", "React Performance"',
    '',
    'User: ' + snippet,
    '',
    'Topic:',
  ].join('\n');
}

/**
 * Select a spread of user messages that captures the session's purpose:
 * first (original intent), middle (evolution), and last (current state).
 * Falls back gracefully for short conversations.
 */
export function selectSpreadMessages(allUserMessages: string[]): string[] {
  const count = allUserMessages.length;
  if (count === 0) return [];
  if (count === 1) return [allUserMessages[0]!];
  if (count === 2) return [allUserMessages[0]!, allUserMessages[1]!];

  const midIndex = Math.floor(count / 2);
  return [allUserMessages[0]!, allUserMessages[midIndex]!, allUserMessages[count - 1]!];
}

/** Build a label for the user messages section based on how many were selected. */
function messagesSectionLabel(count: number): string {
  if (count === 1) return 'User message:';
  if (count === 2) return 'User messages (first, last):';
  return 'User messages (first, middle, last):';
}

/**
 * Build a prompt for regenerating a session title from recent messages.
 *
 * @param recentUserMessages - Spread of user messages (first, middle, last)
 * @param lastAssistantResponse - The most recent assistant response
 * @param options.language - Preferred language for the title
 * @returns Formatted prompt string
 */
export function buildRegenerateTitlePrompt(
  recentUserMessages: string[],
  lastAssistantResponse: string,
  options?: { language?: string }
): string {
  const userContext = recentUserMessages
    .map((msg) => sliceAtWord(msg, 500))
    .join('\n\n');
  const assistantSnippet = sliceAtWord(lastAssistantResponse, 500);

  const lines: string[] = [
    'Based on these messages, what is this conversation about?',
    'Reply with ONLY a short descriptive title (2-5 words).',
    'Use a short descriptive label. Use plain text only - no markdown.',
    buildLanguageInstruction(options?.language),
    'Examples: "Auto Title Generation", "Dark Mode Support", "Fix API Authentication", "Database Schema Design"',
  ];

  lines.push(
    '',
    messagesSectionLabel(recentUserMessages.length),
    userContext,
    '',
    'Latest assistant response:',
    assistantSnippet,
    '',
    'Topic:',
  );

  return lines.join('\n');
}

/**
 * Validate and clean a generated title.
 *
 * Strips common LLM preamble artifacts (leading "Title:", quotes, markdown)
 * then checks length bounds.
 *
 * @param title - The raw title from the model
 * @returns Cleaned title, or null if invalid
 */
export function validateTitle(title: string | null | undefined): string | null {
  if (!title) return null;

  let cleaned = title.trim();

  // Strip common LLM preamble prefixes
  cleaned = cleaned.replace(/^(?:Title|Topic|Sure|Here(?:'s| is))[:\s,]*/i, '');

  // Strip surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // Strip leading markdown markers
  cleaned = cleaned.replace(/^[#\-*]\s+/, '');

  cleaned = cleaned.trim();

  if (cleaned.length > 0 && cleaned.length < 100) {
    return cleaned;
  }
  return null;
}
