import React, { memo, useMemo } from 'react';
import { Box, Text } from 'ink';
import { formatTokens } from '../utils/markdown.ts';

export interface HeaderProps {
  connected: boolean;
  model?: string;
  mcpUrl?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export const Header: React.FC<HeaderProps> = memo(({
  connected,
  model = 'claude-sonnet-4-5-20250929',
  mcpUrl,
  inputTokens = 0,
  outputTokens = 0,
  costUsd = 0,
}) => {
  // Map model IDs to friendly names
  const modelDisplay = useMemo(() => {
    const modelNames: Record<string, string> = {
      'claude-opus-4-5-20251101': 'Opus 4.5',
      'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
      'claude-haiku-4-5-20251001': 'Haiku 4.5',
    };
    return modelNames[model] || model.replace('claude-', '').replace(/-\d{8}$/, '');
  }, [model]);

  // Extract MCP server name from URL
  const mcpDisplay = useMemo(() => mcpUrl
    ? mcpUrl.replace(/^https?:\/\//, '').split('/')[0]
    : 'Not connected', [mcpUrl]);

  const totalTokens = inputTokens + outputTokens;

  // Format cost from SDK (already in USD)
  const costDisplay = useMemo(() => {
    if (costUsd < 0.01) {
      return `$${(costUsd * 100).toFixed(2)}¢`;
    }
    return `$${costUsd.toFixed(4)}`;
  }, [costUsd]);

  return (
    <Box justifyContent="space-between">
      <Box>
        <Text color="magenta" bold>craft</Text>
        <Text dimColor> | </Text>
        <Text color={connected ? 'green' : 'red'}>
          {connected ? '●' : '○'}
        </Text>
        <Text dimColor> {mcpDisplay}</Text>
      </Box>

      <Box>
        {totalTokens > 0 && (
          <>
            <Text dimColor>{formatTokens(totalTokens)} tokens</Text>
            <Text dimColor> ({costDisplay})</Text>
            <Text dimColor> | </Text>
          </>
        )}
        <Text color="cyan">{modelDisplay}</Text>
      </Box>
    </Box>
  );
});

/**
 * Minimal status line for bottom of screen
 */
export interface StatusLineProps {
  isProcessing: boolean;
  connected: boolean;
  compact?: boolean;
}

export const StatusLine: React.FC<StatusLineProps> = memo(({
  isProcessing,
  connected,
  compact = false,
}) => {
  return (
    <Box paddingX={1}>
      <Text dimColor>
        {isProcessing ? 'Ctrl+C to interrupt' : 'Ctrl+C to exit'}
        {' | '}
        /help for commands
        {!compact && (
          <>
            {' | '}
            /clear to reset
          </>
        )}
      </Text>
    </Box>
  );
});

/**
 * Welcome banner shown on startup with ASCII art logo
 */
export const WelcomeBanner: React.FC<{ version?: string }> = memo(({ version = '1.0.0' }) => {
  const logo = [
    '        ██████ ███████    █████   ████████ █████████',
    '      ████████ ████████ █████████ ████████ █████████',
    '     ████████  ████████ █████████ ███████  █████████',
    '      ████████ ███████  █████████ ███████     ████  ',
    '       ███████ ███████  ████ ████ ████        ████  ',
  ];

  return (
    <Box flexDirection="column" marginBottom={1}>
      {logo.map((line, i) => (
        <Box key={i}>
          <Text color="magenta" bold>{line}</Text>
        </Box>
      ))}
    </Box>
  );
});
