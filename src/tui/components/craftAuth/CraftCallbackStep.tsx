import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import crypto from 'crypto';
import open from 'open';
import { createCallbackServer } from '../../../auth/callback-server';
import { CraftApi } from '../../../clients/craftApi';
import { AnimatedSpinner } from '../Spinner';

export interface CraftCallbackStepProps {
  onComplete: (params: { token: string }) => void;
  onBack: () => void;
}

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32)
    .toString('base64url');

  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

const callback = async () => {
  const callbackServer = await createCallbackServer();
  const { codeVerifier, codeChallenge } = generatePKCE();
  const callbackUrl = `${callbackServer.url}/callback`;
  const state = generateState();

  const platform = 'chaps';
  const domain = 'docs.craft.do';
  const url = `http://${domain}/login?platform=${encodeURIComponent(platform)}&code_challenge=${encodeURIComponent(codeChallenge)}&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(callbackUrl)}`;
  return { url, callbackUrl, callbackServer, codeVerifier, state };
};

type AuthStatus = 'initializing' | 'ready' | 'waiting' | 'error';

export const CraftCallbackStep: React.FC<CraftCallbackStepProps> = ({ onComplete, onBack }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [error, setError] = useState<string | null>(null);
  const callbackDataRef = useRef<{
    callbackUrl: string;
    callbackServer: Awaited<ReturnType<typeof createCallbackServer>>;
    state: string;
    codeVerifier: string;
  } | null>(null);

  // Open browser with the auth URL
  const openBrowser = async () => {
    if (!url) return;
    setStatus('waiting');
    try {
      await open(url);
    } catch (err) {
      // Browser open failed, but user can still copy URL manually
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    // Press Enter or 'o' to open browser
    if ((key.return || input === 'o') && url && status === 'ready') {
      openBrowser();
    }
  });

  // Initialize the callback server and URL
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { url, callbackUrl, callbackServer, state, codeVerifier } = await callback();
        if (cancelled) return;
        
        callbackDataRef.current = { callbackUrl, callbackServer, state, codeVerifier };
        setUrl(url);
        setStatus('ready');

        // Wait for callback
        const payload = await callbackServer.promise;
        if (cancelled) return;

        const callbackState = payload.query.state;
        const callbackCode = payload.query.code;
        
        if (callbackState !== state) {
          setError('State mismatch - possible security issue');
          setStatus('error');
          return;
        }
        if (!callbackCode) {
          setError('No authorization code received');
          setStatus('error');
          return;
        }
        
        const craftApi = new CraftApi('https://api.craft.do');
        const token = await craftApi.exchangeCodeForToken({ code: callbackCode, redirectUri: callbackUrl, codeVerifier });
        onComplete({ token });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onComplete]);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>🔐 Authorize with Craft</Text>
      </Box>

      {/* Status-based content */}
      {status === 'initializing' && (
        <Box marginY={1}>
          <AnimatedSpinner />
          <Text> Setting up authorization...</Text>
        </Box>
      )}

      {status === 'ready' && (
        <Box flexDirection="column" marginY={1}>
          <Text>Press <Text bold color="cyan">Enter</Text> or <Text bold color="cyan">o</Text> to open your browser and sign in to Craft.</Text>
          <Box marginTop={1}>
            <Text dimColor>You'll be redirected back automatically after signing in.</Text>
          </Box>
        </Box>
      )}

      {status === 'waiting' && (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <AnimatedSpinner />
            <Text> Waiting for authorization...</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Complete the sign-in in your browser.</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>If the browser didn't open, visit this URL:</Text>
            <Text dimColor color="blue">{url}</Text>
          </Box>
        </Box>
      )}

      {status === 'error' && (
        <Box flexDirection="column" marginY={1}>
          <Text color="red">✗ {error}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Esc to go back and try again.</Text>
          </Box>
        </Box>
      )}

      {/* Footer instructions */}
      <Box marginTop={1}>
        {status === 'ready' && (
          <Text dimColor>Press Enter to open browser, Esc to go back</Text>
        )}
        {status === 'waiting' && (
          <Text dimColor>Press Esc to cancel</Text>
        )}
      </Box>
    </Box>
  );
};
