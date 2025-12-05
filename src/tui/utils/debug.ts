import { appendFileSync } from 'fs';

const LOG_FILE = '/tmp/craft-debug.log';

/**
 * Debug logging utility that writes to a file for viewing with `tail -f`.
 * Use with `craft --debug` to see live logs in a split terminal.
 */
export function debug(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const formatted = args.length > 0
    ? `${timestamp} ${message} ${args.map(a =>
        typeof a === 'object' ? JSON.stringify(a) : String(a)
      ).join(' ')}\n`
    : `${timestamp} ${message}\n`;

  try {
    appendFileSync(LOG_FILE, formatted);
  } catch {
    // Silently ignore if we can't write to the log file
  }
}
