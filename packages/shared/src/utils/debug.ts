// Check CRAFT_DEBUG env var at module load (for SDK subprocess)
// Guard against browser/renderer contexts where process is undefined
let debugEnabled = typeof process !== 'undefined' && process.env?.CRAFT_DEBUG === '1';

function isCliJsonOnlyMode(): boolean {
  return typeof process !== 'undefined' && process.env?.CRAFT_CLI_JSON_ONLY === '1';
}

/**
 * Runtime environment detection
 */
type Environment = 'browser' | 'cli';

function detectEnvironment(): Environment {
  if (typeof process === 'undefined') {
    return 'browser';
  }
  return 'cli';
}

/**
 * Enable debug logging. Call this when --debug flag is passed.
 */
export function enableDebug(): void {
  debugEnabled = true;
}

/**
 * Check if debug mode is enabled.
 */
export function isDebugEnabled(): boolean {
  if (isCliJsonOnlyMode()) return false;
  return debugEnabled;
}

/**
 * Safely stringify an object, handling circular references.
 */
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    // Handle circular references by using a replacer that tracks seen objects
    const seen = new WeakSet();
    return JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    });
  }
}

/**
 * Format a log message with timestamp and optional scope.
 */
function formatMessage(scope: string | undefined, message: string, args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const scopeStr = scope ? `[${scope}] ` : '';
  const argsStr = args.length > 0
    ? ' ' + args.map(a => typeof a === 'object' ? safeStringify(a) : String(a)).join(' ')
    : '';
  return `${timestamp} ${scopeStr}${message}${argsStr}\n`;
}

/**
 * Output log based on environment.
 *
 * Browser output uses console.log; server/CLI output uses stderr to avoid stdout interference.
 */
function output(formatted: string): void {
  const env = detectEnvironment();

  if (env === 'browser') {
    console.log(formatted.trim());
  } else if (typeof process !== 'undefined' && process.stderr) {
    process.stderr.write(formatted);
  } else {
    // Fallback to console for unexpected environments
    console.log(formatted.trim());
  }
}

/**
 * Debug logging utility that auto-routes based on environment.
 * Only logs when debug mode is enabled via --debug flag.
 *
 * Output routing:
 * - Browser: console
 * - Server/CLI/scripts: stderr
 *
 * @example
 * debug('Processing request')
 * debug('User data', { id: 123 })
 */
export function debug(message: string, ...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  output(formatMessage(undefined, message, args));
}

/**
 * Create a scoped logger for a specific module.
 * Scope appears in brackets: [scope] message
 *
 * @example
 * const log = createLogger('agent');
 * log.debug('Starting session');
 * log.info('Connected to MCP');
 * log.error('Failed to connect', error);
 */
export function createLogger(scope: string) {
  const logWithLevel = (level: string, message: string, args: unknown[]) => {
    if (!isDebugEnabled()) return;
    const levelStr = level.toUpperCase().padEnd(5);
    output(formatMessage(scope, `${levelStr} ${message}`, args));
  };

  return {
    debug: (message: string, ...args: unknown[]) => logWithLevel('debug', message, args),
    info: (message: string, ...args: unknown[]) => logWithLevel('info', message, args),
    warn: (message: string, ...args: unknown[]) => logWithLevel('warn', message, args),
    error: (message: string, ...args: unknown[]) => logWithLevel('error', message, args),
  };
}
