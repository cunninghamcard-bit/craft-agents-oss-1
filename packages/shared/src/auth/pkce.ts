/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0
 *
 * Implements RFC 7636 for secure authorization code exchange.
 */

import crypto from 'crypto';

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generate a PKCE code verifier and challenge pair.
 *
 * The code verifier is a cryptographically random string.
 * The code challenge is a base64url-encoded SHA256 hash of the verifier.
 *
 * @returns PKCE challenge pair
 */
export function generatePKCE(): PKCEChallenge {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Generate a cryptographically secure state parameter for CSRF protection.
 *
 * @returns Random state string
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Build a Craft OAuth login URL with PKCE parameters.
 *
 * @param options - OAuth URL options
 * @returns The full login URL to redirect users to
 */
export function buildCraftLoginUrl(options: {
  codeChallenge: string;
  state: string;
  redirectUri: string;
  platform?: string;
  domain?: string;
}): string {
  const {
    codeChallenge,
    state,
    redirectUri,
    platform = 'chaps',
    domain = 'docs.craft.do',
  } = options;

  const params = new URLSearchParams({
    platform,
    code_challenge: codeChallenge,
    state,
    redirect_uri: redirectUri,
  });

  // Use http - Craft handles the redirect to https
  return `http://${domain}/login?${params.toString()}`;
}
