import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import open from 'open';
import { createCallbackServer, generatePKCE, generateState, buildCraftLoginUrl, type CallbackServer } from '@craft-agent/shared/auth';
import { CraftApi, type ProfileResponse } from '@craft-agent/shared/clients';
import { AnimatedSpinner } from './Spinner.tsx';
import { debug } from '@craft-agent/shared/utils';
import { checkSubscription } from '@craft-agent/shared/subscription';
import { getCredentialManager } from '@craft-agent/shared/credentials';

export interface CraftCreditsAuthProps {
  onSubmit: (token: string) => void;
  onCancel: () => void;
}

const createCallback = async () => {
  const callbackServer = await createCallbackServer();
  const { codeVerifier, codeChallenge } = generatePKCE();
  const callbackUrl = `${callbackServer.url}/callback`;
  const state = generateState();
  const url = buildCraftLoginUrl({ codeChallenge, state, redirectUri: callbackUrl });
  return { url, callbackUrl, callbackServer, codeVerifier, state };
};

type AuthStatus = 'ready' | 'waiting' | 'checking-subscription' | 'blocked' | 'error';

export const CraftCreditsAuth: React.FC<CraftCreditsAuthProps> = ({ onSubmit, onCancel }) => {
  const [status, setStatus] = useState<AuthStatus>('ready');
  const [error, setError] = useState<string | null>(null);
  const [subscribeUrl, setSubscribeUrl] = useState<string | null>(null);
  const authResultRef = useRef<{ token: string; profile: ProfileResponse } | null>(null);
  const isAuthenticatingRef = useRef(false);
  const callbackServerRef = useRef<CallbackServer | null>(null);

  // Cleanup callback server on unmount
  useEffect(() => {
    return () => {
      if (callbackServerRef.current) {
        callbackServerRef.current.close();
        callbackServerRef.current = null;
      }
    };
  }, []);

  // Open subscribe page
  const openSubscribePage = useCallback(async () => {
    if (!subscribeUrl) return;
    try {
      await open(subscribeUrl);
    } catch {
      // Browser open failed, user can copy URL manually
    }
  }, [subscribeUrl]);

  // Check subscription and complete if paid
  const checkAndComplete = useCallback(async () => {
    const authResult = authResultRef.current;
    if (!authResult) return;

    setStatus('checking-subscription');
    const subUrl = await checkSubscription(authResult.profile);
    if (subUrl) {
      setSubscribeUrl(subUrl);
      setStatus('blocked');
    } else {
      onSubmit(authResult.token);
    }
  }, [onSubmit]);

  // Start OAuth flow
  const startAuth = useCallback(async () => {
    if (isAuthenticatingRef.current) return;
    isAuthenticatingRef.current = true;

    setStatus('waiting');
    setError(null);

    try {
      const { url, callbackUrl, callbackServer, state, codeVerifier } = await createCallback();
      callbackServerRef.current = callbackServer;

      // Open browser
      try {
        await open(url);
      } catch {
        // Browser open failed, but continue
      }

      // Wait for callback
      const payload = await callbackServer.promise;
      callbackServerRef.current = null; // Server auto-closes after callback

      const callbackState = payload.query.state;
      const callbackCode = payload.query.code;

      if (callbackState !== state) {
        setError('State mismatch - possible security issue');
        setStatus('error');
        isAuthenticatingRef.current = false;
        return;
      }
      if (!callbackCode) {
        setError('No authorization code received');
        setStatus('error');
        isAuthenticatingRef.current = false;
        return;
      }

      const craftApi = new CraftApi();
      debug('[CraftCreditsAuth] exchanging code for token');
      const token = await craftApi.exchangeCodeForToken({
        code: callbackCode,
        redirectUri: callbackUrl,
        codeVerifier,
      });

      // Fetch profile and save token
      const profile = await craftApi.getProfile(token);
      const manager = getCredentialManager();
      await manager.setCraftOAuth(token);

      // Store auth result and check subscription
      authResultRef.current = { token, profile };
      setStatus('checking-subscription');
      const subUrl = await checkSubscription(profile);

      if (subUrl) {
        setSubscribeUrl(subUrl);
        setStatus('blocked');
      } else {
        onSubmit(token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStatus('error');
    }

    isAuthenticatingRef.current = false;
  }, [onSubmit]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    // Ready state: Enter to start auth
    if (status === 'ready' && key.return) {
      startAuth();
    }

    // Blocked state: Enter to open subscribe page, R to retry check
    if (status === 'blocked') {
      if (key.return) {
        openSubscribePage();
      } else if (input === 'r' || input === 'R') {
        checkAndComplete();
      }
    }

    // Error state: Enter to retry
    if (status === 'error' && key.return) {
      setStatus('ready');
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Craft Credits Authentication</Text>
      </Box>

      {status === 'ready' && (
        <Box flexDirection="column">
          <Text>Press <Text bold color="cyan">Enter</Text> to open your browser and sign in to Craft.</Text>
          <Box marginTop={1}>
            <Text dimColor>You'll be redirected back automatically.</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>↵ authenticate • Esc cancel</Text>
          </Box>
        </Box>
      )}

      {status === 'waiting' && (
        <Box flexDirection="column">
          <Box>
            <AnimatedSpinner />
            <Text> Waiting for authorization...</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Complete sign-in in your browser.</Text>
          </Box>
        </Box>
      )}

      {status === 'checking-subscription' && (
        <Box flexDirection="column">
          <Box>
            <AnimatedSpinner />
            <Text> Checking subscription...</Text>
          </Box>
        </Box>
      )}

      {status === 'blocked' && (
        <Box flexDirection="column">
          <Text color="yellow">Subscription Required</Text>
          <Box marginY={1} flexDirection="column">
            <Text>A paid Craft subscription is required to use Craft Credits.</Text>
            {subscribeUrl && (
              <Box marginTop={1}>
                <Text dimColor>{subscribeUrl}</Text>
              </Box>
            )}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>↵ open browser • R check again • Esc cancel</Text>
          </Box>
        </Box>
      )}

      {status === 'error' && (
        <Box flexDirection="column">
          <Text color="red">{error}</Text>
          <Box marginTop={1}>
            <Text dimColor>↵ retry • Esc cancel</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
