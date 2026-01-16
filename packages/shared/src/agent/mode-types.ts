/**
 * Mode Types and Constants
 *
 * Pure types and UI configuration for permission modes.
 * This file has NO runtime dependencies - safe for browser bundling.
 *
 * For runtime mode management functions, use './mode-manager.ts'
 */

import { z } from 'zod';

// ============================================================
// Permission Mode Types
// ============================================================

/**
 * Available permission modes
 * - 'safe': Read-only, blocks writes, never prompts (green)
 * - 'ask': Prompts for dangerous operations (amber)
 * - 'allow-all': Everything allowed, no prompts (violet)
 */
export type PermissionMode = 'safe' | 'ask' | 'allow-all';

/**
 * Order of modes for cycling with SHIFT+TAB
 */
export const PERMISSION_MODE_ORDER: PermissionMode[] = ['safe', 'ask', 'allow-all'];

// ============================================================
// Permissions Config Types (Browser-safe Zod schemas)
// ============================================================

/**
 * API endpoint rule - method + path pattern
 */
const ApiEndpointRuleSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  path: z.string().describe('Regex pattern for API path'),
  comment: z.string().optional(),
});

export type ApiEndpointRule = z.infer<typeof ApiEndpointRuleSchema>;

/**
 * Pattern with optional comment
 */
const PatternSchema = z.union([
  z.string(),
  z.object({
    pattern: z.string(),
    comment: z.string().optional(),
  }),
]);

/**
 * Permissions JSON configuration schema
 */
export const PermissionsConfigSchema = z.object({
  /** Additional tools to block */
  blockedTools: z.array(z.string()).optional(),
  /** Bash command patterns to allow (regex strings) */
  allowedBashPatterns: z.array(PatternSchema).optional(),
  /** MCP tool patterns to allow (regex strings) */
  allowedMcpPatterns: z.array(PatternSchema).optional(),
  /** API endpoint rules - method + path pattern */
  allowedApiEndpoints: z.array(ApiEndpointRuleSchema).optional(),
  /** File paths to allow writes in Explore mode (glob patterns) */
  allowedWritePaths: z.array(PatternSchema).optional(),
});

export type PermissionsConfigFile = z.infer<typeof PermissionsConfigSchema>;

// ============================================================
// Mode Config Types
// ============================================================

/**
 * Compiled API endpoint rule for runtime checking
 */
export interface CompiledApiEndpointRule {
  method: string;
  pathPattern: RegExp;
}

/**
 * Safe mode configuration - defines behavior for read-only mode
 */
export interface ModeConfig {
  /** Tools that are always blocked in safe mode (Write, Edit, etc.) */
  blockedTools: Set<string>;
  /** Tools blocked via permissions.json only - used in ask/allow-all modes */
  customBlockedTools?: Set<string>;
  /** Read-only Bash command patterns (commands matching these are allowed) */
  readOnlyBashPatterns: RegExp[];
  /** Read-only MCP patterns (tools matching these are allowed) */
  readOnlyMcpPatterns: RegExp[];
  /** Fine-grained API endpoint rules (method + path pattern) */
  allowedApiEndpoints: CompiledApiEndpointRule[];
  /** File paths allowed for writes in Explore mode (glob patterns) */
  allowedWritePaths?: string[];
  /** User-friendly name */
  displayName: string;
  /** Keyboard shortcut hint */
  shortcutHint: string;
}

// ============================================================
// Safe Mode Configuration (Browser-safe - pure data)
// ============================================================

/**
 * Configuration for safe mode (read-only exploration)
 */
export const SAFE_MODE_CONFIG: ModeConfig = {
  // Tools that are always blocked (no read-only variant)
  blockedTools: new Set([
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
  ]),
  // Read-only Bash commands that are safe to run
  readOnlyBashPatterns: [
    // File listing and inspection
    /^ls\b/,
    /^ll\b/,
    /^la\b/,
    /^tree\b/,
    /^file\b/,
    /^stat\b/,
    /^du\b/,
    /^df\b/,
    /^wc\b/,
    /^head\b/,
    /^tail\b/,
    /^cat\b/,
    /^less\b/,
    /^more\b/,
    /^bat\b/,

    // Search and find
    /^find\b/,
    /^locate\b/,
    /^which\b/,
    /^whereis\b/,
    /^type\b/,
    /^grep\b/,
    /^rg\b/,
    /^ag\b/,
    /^ack\b/,
    /^fd\b/,
    /^fzf\b/,

    // Git read operations
    /^git\s+(status|log|diff|show|branch|tag|remote|stash\s+list|describe|rev-parse|config\s+--get|config\s+-l|ls-files|ls-tree|shortlog|blame|annotate|reflog|cherry|whatchanged|ls-remote)\b/,

    // GitHub CLI read operations
    /^gh\s+(pr|issue|repo|release|run|workflow|gist|project)\s+(view|list|status|diff|checks|comments)\b/,
    /^gh\s+api\b.*--method\s+GET\b/,
    /^gh\s+api\b(?!.*--method)/,  // gh api without method defaults to GET
    /^gh\s+auth\s+status\b/,
    /^gh\s+config\s+(get|list)\b/,

    // Package manager read operations
    /^npm\s+(ls|list|view|info|show|outdated|audit|search|explain|why|config\s+get|config\s+list)\b/,
    /^yarn\s+(list|info|why|outdated|audit)\b/,
    /^pnpm\s+(list|ls|why|outdated|audit)\b/,
    /^bun\s+(pm\s+ls)\b/,
    /^pip\s+(list|show|freeze|check)\b/,
    /^pip3\s+(list|show|freeze|check)\b/,
    /^cargo\s+(tree|metadata|pkgid|verify-project)\b/,
    /^go\s+(list|mod\s+graph|mod\s+why|version)\b/,
    /^composer\s+(show|info|outdated|licenses)\b/,
    /^gem\s+(list|info|dependency|environment)\b/,
    /^bundle\s+(list|info|outdated)\b/,

    // System info
    /^pwd\b/,
    /^whoami\b/,
    /^id\b/,
    /^groups\b/,
    /^uname\b/,
    /^hostname\b/,
    /^date\b/,
    /^uptime\b/,
    /^env$/,  // Only bare 'env' to print vars, NOT 'env <command>'
    /^printenv\b/,
    /^echo\s+\$/,  // echo $VAR (reading env vars)
    /^ps\b/,
    /^top\s+-[lb]/,  // batch/list mode only
    /^htop\b/,
    /^free\b/,
    /^vmstat\b/,
    /^iostat\b/,
    /^lscpu\b/,
    /^lsmem\b/,
    /^lsblk\b/,
    /^lsusb\b/,
    /^lspci\b/,

    // Docker read operations
    /^docker\s+(ps|images|logs|inspect|stats|top|port|diff|history|version|info|system\s+info|system\s+df|network\s+ls|network\s+inspect|volume\s+ls|volume\s+inspect|container\s+ls|image\s+ls)\b/,
    /^docker-compose\s+(ps|logs|config|images|top|version)\b/,
    /^docker\s+compose\s+(ps|logs|config|images|top|version)\b/,

    // Kubernetes read operations
    /^kubectl\s+(get|describe|logs|top|explain|api-resources|api-versions|cluster-info|config\s+view|config\s+get-contexts|version)\b/,

    // Text processing (read-only)
    // NOTE: awk is NOT safe - it can execute shell commands via system(), getline, print|
    // Users can add it to permissions.json if they accept the risk
    /^sed\s+-n\b/,  // sed -n (print only, no editing)
    /^sort\b/,
    /^uniq\b/,
    /^cut\b/,
    /^tr\b/,
    /^column\b/,
    /^jq\b/,
    /^yq\b/,
    /^xq\b/,
    /^xmllint\b/,
    /^json_pp\b/,
    /^python\s+-m\s+json\.tool\b/,

    // Network diagnostics (read-only)
    /^ping\b/,
    /^traceroute\b/,
    /^tracepath\b/,
    /^mtr\b/,
    /^dig\b/,
    /^nslookup\b/,
    /^host\b/,
    /^netstat\b/,
    /^ss\b/,
    /^ip\s+(addr|link|route|neigh)\s*(show)?\b/,
    /^ifconfig\b/,

    // Version checks
    /^node\s+(--version|-v)\b/,
    /^npm\s+(--version|-v)\b/,
    /^yarn\s+(--version|-v)\b/,
    /^pnpm\s+(--version|-v)\b/,
    /^bun\s+(--version|-v)\b/,
    /^python\s+(--version|-V)\b/,
    /^python3\s+(--version|-V)\b/,
    /^ruby\s+(--version|-v)\b/,
    /^go\s+version\b/,
    /^rustc\s+(--version|-V)\b/,
    /^cargo\s+(--version|-V)\b/,
    /^java\s+(-version|--version)\b/,
    /^dotnet\s+--version\b/,
    /^php\s+(--version|-v)\b/,
    /^perl\s+(--version|-v)\b/,

    // Help commands
    /^man\b/,
    /--help\b/,
    /-h\b$/,
  ],
  readOnlyMcpPatterns: [
    // Craft MCP - read operations
    /blocks_read/,
    /blocks_list/,
    /blocks_get/,
    /document_get/,
    /document_list/,
    /spaces_list/,
    /folders_list/,
    /search/,
    /list/,
    /get/,
    /read/,
  ],
  allowedApiEndpoints: [], // Use permissions.json to add endpoint-specific rules
  displayName: 'Safe Mode',
  shortcutHint: 'SHIFT+TAB',
};

/**
 * Display configuration for each mode
 */
export const PERMISSION_MODE_CONFIG: Record<PermissionMode, {
  displayName: string;
  shortName: string;
  description: string;
  /** SVG path data for the icon (viewBox 0 0 24 24, stroke-based) */
  svgPath: string;
  /** Tailwind color classes for consistent theming */
  colorClass: {
    /** Text color class (e.g., 'text-info') */
    text: string;
    /** Background color class (e.g., 'bg-info') */
    bg: string;
    /** Border color class (e.g., 'border-info') */
    border: string;
  };
}> = {
  'safe': {
    displayName: 'Explore',
    shortName: 'Explore',
    description: 'Read-only exploration. Blocks writes, never prompts.',
    // Compass icon from Lucide
    svgPath: 'M16.24 7.76l-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    colorClass: {
      text: 'text-foreground/60',
      bg: 'bg-foreground/60',
      border: 'border-foreground/60',
    },
  },
  'ask': {
    displayName: 'Ask to Edit',
    shortName: 'Ask',
    description: 'Prompts before making edits.',
    // Info icon from Lucide
    svgPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8v4m0 4h.01',
    colorClass: {
      text: 'text-info',
      bg: 'bg-info',
      border: 'border-info',
    },
  },
  'allow-all': {
    displayName: 'Auto',
    shortName: 'Auto',
    description: 'Automatic execution, no prompts.',
    // Repeat icon from Lucide (loop)
    svgPath: 'm17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
    colorClass: {
      text: 'text-accent',
      bg: 'bg-accent',
      border: 'border-accent',
    },
  },
};
