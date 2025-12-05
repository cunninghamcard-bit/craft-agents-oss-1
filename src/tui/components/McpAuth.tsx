import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { CraftOAuth, getMcpBaseUrl } from '../../auth/oauth.ts';
import { saveServerCredentials } from '../../agents/cache.ts';
import type { McpServerConfig } from '../../agents/types.ts';
import { AnimatedSpinner } from './Spinner.tsx';
import { debug } from '../utils/debug.ts';

export interface McpAuthProps {
  servers: McpServerConfig[];
  workspaceId: string;
  agentId: string;
  onComplete: (success: boolean) => void;
  onCancel: () => void;
}

type AuthStep = 'confirm' | 'authenticating' | 'complete' | 'error';

export const McpAuth: React.FC<McpAuthProps> = ({
  servers,
  workspaceId,
  agentId,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<AuthStep>('confirm');
  const [currentServerIndex, setCurrentServerIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completedServers, setCompletedServers] = useState<string[]>([]);
  const oauthRef = useRef<CraftOAuth | null>(null);
  const isCancelledRef = useRef(false);

  debug('[McpAuth] Mounted with', servers.length, 'servers:', servers.map(s => s.name));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debug('[McpAuth] Unmounting, cancelling any pending OAuth');
      isCancelledRef.current = true;
      if (oauthRef.current) {
        oauthRef.current.cancel();
      }
    };
  }, []);

  const currentServer = servers[currentServerIndex];

  // Handle keyboard input
  useInput((input, key) => {
    // Escape to cancel at any step
    if (key.escape || (key.ctrl && input === 'c')) {
      debug('[McpAuth] User cancelled auth flow');
      isCancelledRef.current = true;
      if (oauthRef.current) {
        oauthRef.current.cancel();
      }
      onCancel();
      return;
    }

    // Enter to start auth when in confirm step
    if (key.return && step === 'confirm') {
      debug('[McpAuth] User confirmed, starting auth for:', currentServer?.name);
      startAuthForCurrentServer();
    }
  });

  const authenticateServer = useCallback(async (server: McpServerConfig): Promise<boolean> => {
    if (isCancelledRef.current) return false;

    debug('[McpAuth] Starting auth for server:', server.name, 'url:', server.url);
    setStatus(`Connecting to ${server.name}...`);

    try {
      const mcpBaseUrl = getMcpBaseUrl(server.url);
      debug('[McpAuth] MCP base URL:', mcpBaseUrl);

      const oauth = new CraftOAuth(
        { mcpBaseUrl },
        {
          onStatus: (message) => {
            debug('[McpAuth] OAuth status:', message);
            if (!isCancelledRef.current) {
              setStatus(message);
            }
          },
          onError: (err) => {
            debug('[McpAuth] OAuth error:', err);
            if (!isCancelledRef.current) {
              setError(err);
            }
          },
        }
      );

      oauthRef.current = oauth;

      debug('[McpAuth] Calling oauth.authenticate()...');
      const { tokens, clientId } = await oauth.authenticate();
      debug('[McpAuth] Auth successful, got tokens. clientId:', clientId, 'expiresAt:', tokens.expiresAt);

      if (isCancelledRef.current) return false;

      // Save credentials including clientId for future token refresh
      debug('[McpAuth] Saving credentials for', server.name, 'clientId:', clientId);
      saveServerCredentials(workspaceId, agentId, server.name, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        clientId,
      });
      debug('[McpAuth] Credentials saved successfully');

      oauthRef.current = null;
      return true;
    } catch (err) {
      if (isCancelledRef.current) return false;
      const message = err instanceof Error ? err.message : 'Authentication failed';
      debug('[McpAuth] Auth failed for', server.name, ':', message);
      setError(`${server.name}: ${message}`);
      oauthRef.current = null;
      return false;
    }
  }, [workspaceId, agentId]);

  const startAuthForCurrentServer = useCallback(async () => {
    if (servers.length === 0) {
      debug('[McpAuth] No servers to authenticate');
      onComplete(true);
      return;
    }

    const server = servers[currentServerIndex];
    if (!server) return;

    debug('[McpAuth] Starting authentication for server', currentServerIndex + 1, 'of', servers.length, ':', server.name);
    setStep('authenticating');
    setError(null);

    const success = await authenticateServer(server);

    if (isCancelledRef.current) return;

    if (!success) {
      debug('[McpAuth] Server auth failed');
      setStep('error');
      return;
    }

    debug('[McpAuth] Server', server.name, 'authenticated successfully');
    setCompletedServers((prev) => [...prev, server.name]);

    // Check if there are more servers
    const nextIndex = currentServerIndex + 1;
    if (nextIndex < servers.length) {
      // Move to next server, show confirm step
      setCurrentServerIndex(nextIndex);
      setStep('confirm');
      setStatus('');
    } else {
      // All done
      debug('[McpAuth] All servers authenticated successfully');
      setStep('complete');
      setStatus('All servers authenticated');

      // Small delay to show success before closing
      setTimeout(() => {
        if (!isCancelledRef.current) {
          debug('[McpAuth] Completing auth flow');
          onComplete(true);
        }
      }, 1000);
    }
  }, [servers, currentServerIndex, authenticateServer, onComplete]);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>MCP Server Authentication</Text>
        {servers.length > 1 && (
          <Text dimColor> - {currentServerIndex + 1} of {servers.length}</Text>
        )}
      </Box>

      {/* Server list */}
      <Box flexDirection="column" marginBottom={1}>
        {servers.map((server, i) => (
          <Box key={server.url}>
            <Text>
              {completedServers.includes(server.name) ? (
                <Text color="green">✓ </Text>
              ) : i === currentServerIndex && step === 'authenticating' ? (
                <Text color="yellow">● </Text>
              ) : i === currentServerIndex && step === 'confirm' ? (
                <Text color="cyan">→ </Text>
              ) : (
                <Text dimColor>○ </Text>
              )}
              <Text dimColor={i > currentServerIndex && !completedServers.includes(server.name)}>
                {server.name}
              </Text>
            </Text>
          </Box>
        ))}
      </Box>

      {/* Confirm step - waiting for user to press Enter */}
      {step === 'confirm' && currentServer && (
        <Box marginY={1} flexDirection="column">
          <Text>
            Ready to authenticate with <Text bold color="cyan">{currentServer.name}</Text>
          </Text>
          <Text dimColor>This will open your browser for authorization.</Text>
        </Box>
      )}

      {/* Authenticating step */}
      {step === 'authenticating' && (
        <Box marginY={1}>
          <AnimatedSpinner />
          <Text> {status}</Text>
        </Box>
      )}

      {/* Complete step */}
      {step === 'complete' && (
        <Box marginY={1}>
          <Text color="green">✓ {status}</Text>
        </Box>
      )}

      {/* Error step */}
      {step === 'error' && (
        <Box marginY={1} flexDirection="column">
          <Text color="red">✗ Authentication failed</Text>
          {error && <Text color="red">{error}</Text>}
        </Box>
      )}

      {/* Instructions */}
      <Box marginTop={1}>
        {step === 'confirm' && (
          <Text dimColor>Press Enter to continue, Esc to cancel</Text>
        )}
        {step === 'authenticating' && (
          <Text dimColor>Complete authorization in your browser. Press Esc to cancel.</Text>
        )}
        {step === 'error' && (
          <Text dimColor>Press Esc to close</Text>
        )}
      </Box>
    </Box>
  );
};
