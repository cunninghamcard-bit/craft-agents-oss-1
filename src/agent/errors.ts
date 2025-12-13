/**
 * Typed errors for better error handling and user-friendly messages.
 *
 * These error types map HTTP status codes and error patterns to
 * actionable error information that can be displayed to users.
 */

export type ErrorCode =
  | 'insufficient_credits'
  | 'invalid_api_key'
  | 'expired_oauth_token'
  | 'rate_limited'
  | 'service_error'
  | 'network_error'
  | 'mcp_auth_required'
  | 'unknown_error';

export interface RecoveryAction {
  /** Keyboard shortcut (single letter) */
  key: string;
  /** Description of the action */
  label: string;
  /** Slash command to execute (e.g., '/credits') */
  command?: string;
  /** Custom action type for special handling */
  action?: 'retry' | 'settings' | 'credits' | 'reauth';
}

export interface AgentError {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** User-friendly title */
  title: string;
  /** Detailed message explaining what went wrong */
  message: string;
  /** Suggested recovery actions */
  actions: RecoveryAction[];
  /** Whether auto-retry is possible */
  canRetry: boolean;
  /** Retry delay in ms (if canRetry is true) */
  retryDelayMs?: number;
  /** Original error message for debugging */
  originalError?: string;
}

/**
 * Error definitions with user-friendly messages and recovery actions
 */
const ERROR_DEFINITIONS: Record<ErrorCode, Omit<AgentError, 'code' | 'originalError'>> = {
  insufficient_credits: {
    title: 'Insufficient Credits',
    message: 'Your Craft Credits balance is empty.',
    actions: [
      { key: 'c', label: 'Check and top-up credits if needed', command: '/credits', action: 'credits' },
    ],
    canRetry: false,
  },
  invalid_api_key: {
    title: 'Invalid API Key',
    message: 'Your Anthropic API key was rejected. It may be invalid or expired.',
    actions: [
      { key: 's', label: 'Update API key', command: '/settings', action: 'settings' },
    ],
    canRetry: false,
  },
  expired_oauth_token: {
    title: 'Session Expired',
    message: 'Your Claude Max session has expired.',
    actions: [
      { key: 'r', label: 'Re-authenticate', action: 'reauth' },
      { key: 's', label: 'Switch billing method', command: '/settings', action: 'settings' },
    ],
    canRetry: false,
  },
  rate_limited: {
    title: 'Rate Limited',
    message: 'Too many requests. Please wait a moment.',
    actions: [
      { key: 'r', label: 'Retry', action: 'retry' },
    ],
    canRetry: true,
    retryDelayMs: 5000,
  },
  service_error: {
    title: 'Service Error',
    message: 'The AI service is temporarily unavailable.',
    actions: [
      { key: 'r', label: 'Retry', action: 'retry' },
    ],
    canRetry: true,
    retryDelayMs: 2000,
  },
  network_error: {
    title: 'Connection Error',
    message: 'Could not connect to the server. Check your internet connection.',
    actions: [
      { key: 'r', label: 'Retry', action: 'retry' },
    ],
    canRetry: true,
    retryDelayMs: 1000,
  },
  mcp_auth_required: {
    title: 'Workspace Authentication Required',
    message: 'Your workspace connection needs to be re-authenticated.',
    actions: [
      { key: 'w', label: 'Open workspace menu', command: '/workspace' },
    ],
    canRetry: false,
  },
  unknown_error: {
    title: 'Error',
    message: 'An unexpected error occurred.',
    actions: [
      { key: 'r', label: 'Retry', action: 'retry' },
    ],
    canRetry: true,
  },
};

/**
 * Parse an error and return a typed AgentError with user-friendly info
 */
export function parseError(error: unknown): AgentError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Detect error type from message/status
  let code: ErrorCode = 'unknown_error';

  // Check for specific HTTP status codes or patterns
  if (lowerMessage.includes('402') || lowerMessage.includes('payment required') || lowerMessage.includes('insufficient credits')) {
    code = 'insufficient_credits';
  } else if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid.*key') || lowerMessage.includes('authentication failed')) {
    // Distinguish between API key and OAuth errors
    if (lowerMessage.includes('oauth') || lowerMessage.includes('token') || lowerMessage.includes('session')) {
      code = 'expired_oauth_token';
    } else {
      code = 'invalid_api_key';
    }
  } else if (lowerMessage.includes('429') || lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    code = 'rate_limited';
  } else if (lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503') || lowerMessage.includes('504') || lowerMessage.includes('internal server error') || lowerMessage.includes('service unavailable')) {
    code = 'service_error';
  } else if (lowerMessage.includes('network') || lowerMessage.includes('econnrefused') || lowerMessage.includes('enotfound') || lowerMessage.includes('fetch failed') || lowerMessage.includes('connection')) {
    code = 'network_error';
  } else if (lowerMessage.includes('mcp') && (lowerMessage.includes('auth') || lowerMessage.includes('401'))) {
    code = 'mcp_auth_required';
  }

  const definition = ERROR_DEFINITIONS[code];

  return {
    code,
    ...definition,
    originalError: errorMessage,
  };
}

/**
 * Check if an error is a billing/credits error that blocks usage
 */
export function isBillingError(error: AgentError): boolean {
  return error.code === 'insufficient_credits' || error.code === 'invalid_api_key' || error.code === 'expired_oauth_token';
}

/**
 * Check if an error can be automatically retried
 */
export function canAutoRetry(error: AgentError): boolean {
  return error.canRetry && error.retryDelayMs !== undefined;
}
