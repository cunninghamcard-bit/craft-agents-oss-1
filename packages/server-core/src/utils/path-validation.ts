import { statSync } from 'fs'

/**
 * Validate path format for the current server platform (no filesystem access).
 * Rejects cross-platform paths (e.g., Windows paths on macOS and vice versa).
 * Platform is injectable for cross-platform unit testing without mocking globals.
 */
export function validatePathFormat(
  path: string,
  platform: NodeJS.Platform = process.platform
): { valid: boolean; reason?: string } {
  const isWindows = platform === 'win32'

  if (!isWindows) {
    if (/^[A-Za-z]:\\/.test(path))
      return { valid: false, reason: 'Windows drive path is not valid on this server. Use a server-side path.' }
    if (path.startsWith('\\\\'))
      return { valid: false, reason: 'UNC path is not valid on this server. Use a server-side path.' }
    if (!path.startsWith('/'))
      return { valid: false, reason: 'Path must be absolute (start with /).' }
  } else {
    if (path.startsWith('/'))
      return { valid: false, reason: 'Unix path is not valid on this server. Use a Windows path (e.g., C:\\...).' }
  }

  return { valid: true }
}

/**
 * Validate that a path is a usable working directory on the current server.
 * Checks format, existence, and that the path is a directory.
 */
export function isValidWorkingDirectory(
  path: string,
  platform: NodeJS.Platform = process.platform
): { valid: boolean; reason?: string } {
  const formatCheck = validatePathFormat(path, platform)
  if (!formatCheck.valid) return formatCheck

  try {
    const s = statSync(path)
    if (!s.isDirectory()) {
      return { valid: false, reason: `Not a directory: ${path}` }
    }
  } catch {
    return { valid: false, reason: `Directory not found: ${path}` }
  }

  return { valid: true }
}
