/**
 * Electron-specific manifest fetching
 *
 * Uses the /electron/ path prefix for Electron app updates.
 * Endpoints:
 * - https://agents.craft.do/electron/latest
 * - https://agents.craft.do/electron/{version}/manifest.json
 */

import { debug } from '../utils/debug';
import type { VersionManifest } from './manifest';

const ELECTRON_VERSIONS_URL = 'https://agents.craft.do/electron';

/** Default timeout for network requests (10 seconds) */
const FETCH_TIMEOUT_MS = 10000;

/**
 * Fetch with timeout to prevent hanging on slow/unresponsive servers
 */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch the latest Electron app version from the server
 */
export async function getElectronLatestVersion(): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`${ELECTRON_VERSIONS_URL}/latest`);
    if (!response.ok) {
      debug(`[electron-manifest] Failed to fetch latest version: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const version = (data as { version?: string }).version;
    if (typeof version !== 'string') {
      debug('[electron-manifest] Latest version is not a valid string');
      return null;
    }
    return version;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      debug('[electron-manifest] Fetch latest version timed out');
    } else {
      debug(`[electron-manifest] Failed to get latest version: ${error}`);
    }
    return null;
  }
}

/**
 * Fetch the manifest for a specific Electron app version
 */
export async function getElectronManifest(version: string): Promise<VersionManifest | null> {
  try {
    const url = `${ELECTRON_VERSIONS_URL}/${version}/manifest.json`;
    debug(`[electron-manifest] Getting manifest for version: ${url}`);
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      debug(`[electron-manifest] Failed to fetch manifest: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data as VersionManifest;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      debug('[electron-manifest] Fetch manifest timed out');
    } else {
      debug(`[electron-manifest] Failed to get manifest: ${error}`);
    }
    return null;
  }
}

/**
 * Parsed semver version with major, minor, patch, and prerelease components
 */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
}

/**
 * Parse a semver version string into its components
 * Handles:
 * - Standard versions: 1.0.0, 0.2.8
 * - Prerelease versions: 1.0.0-alpha.1, 1.0.0-beta, 1.0.0-rc.1
 * - Build metadata: 1.0.0+build.123 (ignored for comparison)
 * - v prefix: v1.0.0
 */
function parseVersion(version: string): ParsedVersion | null {
  // Remove leading 'v' if present
  const v = version.startsWith('v') ? version.slice(1) : version;

  // Split off build metadata (+ suffix)
  const buildSplitIndex = v.indexOf('+');
  const versionWithoutBuild = buildSplitIndex >= 0 ? v.slice(0, buildSplitIndex) : v;
  const buildString = buildSplitIndex >= 0 ? v.slice(buildSplitIndex + 1) : '';
  const build = buildString ? buildString.split('.') : [];

  // Split off prerelease (- suffix)
  const prereleaseSplitIndex = versionWithoutBuild.indexOf('-');
  const coreVersion = prereleaseSplitIndex >= 0 ? versionWithoutBuild.slice(0, prereleaseSplitIndex) : versionWithoutBuild;
  const prereleaseString = prereleaseSplitIndex >= 0 ? versionWithoutBuild.slice(prereleaseSplitIndex + 1) : '';
  const prerelease = prereleaseString ? prereleaseString.split('.') : [];

  // Parse core version (major.minor.patch)
  const coreParts = coreVersion.split('.');
  if (coreParts.length === 0 || coreParts.length > 3) {
    return null;
  }

  const majorStr = coreParts[0];
  const minorStr = coreParts[1];
  const patchStr = coreParts[2];

  if (!majorStr) {
    return null;
  }

  const major = parseInt(majorStr, 10);
  const minor = minorStr ? parseInt(minorStr, 10) : 0;
  const patch = patchStr ? parseInt(patchStr, 10) : 0;

  // Validate numeric parts
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return null;
  }

  return { major, minor, patch, prerelease, build };
}

/**
 * Compare two prerelease identifier arrays according to semver spec
 * Returns: negative if a < b, positive if a > b, 0 if equal
 *
 * Rules (from semver.org):
 * 1. A version with prerelease has LOWER precedence than release (1.0.0-alpha < 1.0.0)
 * 2. Numeric identifiers are compared as integers
 * 3. Alphanumeric identifiers are compared lexically in ASCII sort order
 * 4. Numeric identifiers always have lower precedence than non-numeric
 * 5. A larger set of pre-release fields has higher precedence (1.0.0-alpha < 1.0.0-alpha.1)
 */
function comparePrerelease(a: string[], b: string[]): number {
  // No prerelease = higher precedence (release version)
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;  // a is release, b is prerelease
  if (b.length === 0) return -1; // a is prerelease, b is release

  // Compare each identifier
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    // Missing identifier = lower precedence
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;

    const aId = a[i]!;
    const bId = b[i]!;

    // Check if identifiers are numeric
    const aNum = /^\d+$/.test(aId) ? parseInt(aId, 10) : NaN;
    const bNum = /^\d+$/.test(bId) ? parseInt(bId, 10) : NaN;

    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);

    if (aIsNum && bIsNum) {
      // Both numeric: compare as integers
      if (aNum !== bNum) return aNum - bNum;
    } else if (aIsNum) {
      // Numeric has lower precedence than non-numeric
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      // Both non-numeric: compare lexically
      if (aId < bId) return -1;
      if (aId > bId) return 1;
    }
  }

  return 0;
}

/**
 * Compare two semver version strings
 * Returns true if `latest` is newer than `current`
 *
 * Supports:
 * - Standard versions: 1.0.0, 0.2.8
 * - Prerelease versions: 1.0.0-alpha.1, 1.0.0-beta, 1.0.0-rc.1
 * - Build metadata: 1.0.0+build.123 (ignored for comparison)
 * - v prefix: v1.0.0
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const currentParsed = parseVersion(current);
  const latestParsed = parseVersion(latest);

  // If we can't parse either version, return false (don't update)
  // This is safer than guessing - string comparison like "0.9.0" > "0.10.0" would be wrong
  if (!currentParsed || !latestParsed) {
    debug(`[electron-manifest] Could not parse versions: current=${current}, latest=${latest}. Skipping update.`);
    return false;
  }

  // Compare major.minor.patch
  if (latestParsed.major !== currentParsed.major) {
    return latestParsed.major > currentParsed.major;
  }
  if (latestParsed.minor !== currentParsed.minor) {
    return latestParsed.minor > currentParsed.minor;
  }
  if (latestParsed.patch !== currentParsed.patch) {
    return latestParsed.patch > currentParsed.patch;
  }

  // Same major.minor.patch - compare prerelease
  const prereleaseComparison = comparePrerelease(latestParsed.prerelease, currentParsed.prerelease);
  return prereleaseComparison > 0;
}

/**
 * Get the platform key for the current system (darwin-arm64, darwin-x64, etc.)
 */
export function getPlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;
  return `${platform}-${arch}`;
}
