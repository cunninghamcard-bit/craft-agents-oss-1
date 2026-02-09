/**
 * GitHub OAuth with PKCE
 *
 * Implements browser-based OAuth using PKCE (Proof Key for Code Exchange)
 * for authenticating with GitHub accounts for Copilot access.
 *
 * Credential storage key: `llm_oauth::copilot`
 */
import { randomBytes, createHash } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { openUrl } from '../utils/open-url.ts';
import { generateCallbackPage } from './callback-page.ts';

// ============================================================
// Configuration
// ============================================================

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const CALLBACK_PORT = 1457;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/auth/callback`;
const OAUTH_SCOPES = 'copilot';
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Client ID and secret are injected at build time via environment variables
// These should be configured in the .env file or 1Password sync
const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || '';

// ============================================================
// Types
// ============================================================

export interface GithubTokens {
  /** GitHub OAuth access token */
  accessToken: string;
  /** Refresh token (if available) */
  refreshToken?: string;
  /** Token expiration timestamp (Unix ms) */
  expiresAt?: number;
  /** Token scope */
  scope?: string;
}

export interface GithubOAuthState {
  state: string;
  codeVerifier: string;
  timestamp: number;
  expiresAt: number;
}

// ============================================================
// State
// ============================================================

// In-memory state storage for the current OAuth flow
let currentOAuthState: GithubOAuthState | null = null;

// Callback server instance
let callbackServer: Server | null = null;

// ============================================================
// PKCE Helpers
// ============================================================

function generateState(): string {
  return randomBytes(32).toString('hex');
}

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

// ============================================================
// Callback Server
// ============================================================

function startCallbackServer(
  expectedState: string,
  onCode: (code: string) => void,
  onError: (error: Error) => void
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname === '/auth/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        res.writeHead(200, { 'Content-Type': 'text/html' });

        if (error) {
          res.end(generateCallbackPage({
            title: 'GitHub',
            isSuccess: false,
            errorDetail: errorDescription || error,
          }));
          onError(new Error(errorDescription || error));
          return;
        }

        if (!code || !state) {
          res.end(generateCallbackPage({
            title: 'GitHub',
            isSuccess: false,
            errorDetail: 'Missing authorization code or state parameter',
          }));
          onError(new Error('Missing authorization code or state'));
          return;
        }

        if (state !== expectedState) {
          res.end(generateCallbackPage({
            title: 'GitHub',
            isSuccess: false,
            errorDetail: 'Invalid state parameter. This may be a security issue.',
          }));
          onError(new Error('Invalid state parameter - possible CSRF attack'));
          return;
        }

        res.end(generateCallbackPage({
          title: 'GitHub',
          isSuccess: true,
        }));

        onCode(code);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is already in use. Close any other OAuth flows and try again.`));
      } else {
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

/**
 * Stop the callback server if running
 */
export function stopGithubCallbackServer(): void {
  if (callbackServer) {
    callbackServer.close();
    callbackServer = null;
  }
}

// ============================================================
// OAuth Flow
// ============================================================

/**
 * Start the GitHub OAuth flow.
 *
 * Opens the browser for authentication and starts a local callback server.
 * Returns a promise that resolves with the authorization code.
 */
export async function startGithubOAuth(
  onStatus?: (message: string) => void
): Promise<string> {
  onStatus?.('Generating authentication URL...');

  // Clean up any previous server
  stopGithubCallbackServer();

  // Generate secure random values
  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Store state for later verification
  const now = Date.now();
  currentOAuthState = {
    state,
    codeVerifier,
    timestamp: now,
    expiresAt: now + STATE_EXPIRY_MS,
  };

  // Start callback server
  onStatus?.('Starting authentication server...');

  return new Promise<string>(async (resolve, reject) => {
    try {
      callbackServer = await startCallbackServer(
        state,
        (code) => {
          stopGithubCallbackServer();
          resolve(code);
        },
        (error) => {
          stopGithubCallbackServer();
          clearOAuthState();
          reject(error);
        }
      );

      // Build OAuth URL
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: OAUTH_SCOPES,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      });

      const authUrl = `${GITHUB_AUTH_URL}?${params.toString()}`;

      // Open browser
      onStatus?.('Opening browser for authentication...');
      await openUrl(authUrl);

      onStatus?.('Waiting for authentication...');
    } catch (error) {
      stopGithubCallbackServer();
      clearOAuthState();
      reject(error);
    }
  });
}

/**
 * Check if there is a valid GitHub OAuth state in progress
 */
export function hasValidGithubOAuthState(): boolean {
  if (!currentOAuthState) return false;
  return Date.now() < currentOAuthState.expiresAt;
}

/**
 * Get the current GitHub OAuth state
 */
export function getCurrentGithubOAuthState(): GithubOAuthState | null {
  return currentOAuthState;
}

function clearOAuthState(): void {
  currentOAuthState = null;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeGithubCode(
  authorizationCode: string,
  onStatus?: (message: string) => void
): Promise<GithubTokens> {
  if (!currentOAuthState) {
    throw new Error('No OAuth state found. Please start the authentication flow again.');
  }

  if (Date.now() > currentOAuthState.expiresAt) {
    clearOAuthState();
    throw new Error('OAuth state expired (older than 10 minutes). Please try again.');
  }

  onStatus?.('Exchanging authorization code for tokens...');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: authorizationCode,
    redirect_uri: REDIRECT_URI,
    code_verifier: currentOAuthState.codeVerifier,
  });

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_description || errorJson.error || errorText;
      } catch {
        errorMessage = errorText;
      }
      throw new Error(`Token exchange failed: ${response.status} - ${errorMessage}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    // Clear state after successful exchange
    clearOAuthState();

    onStatus?.('Authentication successful!');

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      scope: data.scope,
    };
  } catch (error) {
    clearOAuthState();
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Token exchange failed: ${String(error)}`);
  }
}

/**
 * Refresh GitHub tokens using a refresh token.
 */
export async function refreshGithubTokens(
  refreshToken: string,
  onStatus?: (message: string) => void
): Promise<GithubTokens> {
  onStatus?.('Refreshing tokens...');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_description || errorJson.error || errorText;
      } catch {
        errorMessage = errorText;
      }
      throw new Error(`Token refresh failed: ${response.status} - ${errorMessage}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      throw new Error(data.error_description || data.error);
    }

    onStatus?.('Tokens refreshed successfully!');

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      scope: data.scope,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Token refresh failed: ${String(error)}`);
  }
}

/**
 * Cancel the current OAuth flow
 */
export function cancelGithubOAuth(): void {
  stopGithubCallbackServer();
  clearOAuthState();
}
