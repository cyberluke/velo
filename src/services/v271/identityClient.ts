import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getV271Config,
  getV271Tokens,
  setV271Tokens,
  V271_SCOPES,
  type V271Tokens,
} from "./settings";

/**
 * V271 Identity client.
 *
 * The NAI app registers as one shared client ("naiemail") on the V271 identity
 * server and authenticates with Authorization Code + PKCE — the same flow
 * the Gmail path uses, against a configurable identity URL instead of
 * Google. The localhost callback server, the token exchange and the token
 * refresh all go through the existing generic Rust OAuth commands, so the
 * WebView's cross-origin limits never apply and tokens are never exposed to
 * page scripts.
 *
 * Tokens are stored through the secure settings (AES-256-GCM, key in the OS
 * credential store).
 */

const OAUTH_CALLBACK_PORT = 17248;

interface OAuthServerResult {
  code: string;
  state: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function resolveUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Sign in against the configured V271 identity server. */
export async function signInWithV271(): Promise<{ email: string | null }> {
  const config = await getV271Config();
  if (!config.identityUrl || !config.clientId) {
    throw new Error("V271 identity server or client id is not configured");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const stateArray = new Uint8Array(32);
  crypto.getRandomValues(stateArray);
  const oauthState = base64UrlEncode(stateArray);
  const redirectUri = `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: V271_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    state: oauthState,
  });

  const authUrl = `${resolveUrl(config.identityUrl, "authorize")}?${params.toString()}`;

  // Start the callback server (blocks until the redirect arrives) and open
  // the browser concurrently.
  const serverPromise = invoke<OAuthServerResult>("start_oauth_server", {
    port: OAUTH_CALLBACK_PORT,
    state: oauthState,
  });
  await new Promise((r) => setTimeout(r, 100));
  await openUrl(authUrl);

  const result = await serverPromise;
  if (result.state !== oauthState) {
    throw new Error("V271 OAuth state mismatch — possible CSRF attack. Please try again.");
  }

  const tokens = await exchangeCode(result.code, config.clientId, redirectUri, codeVerifier);

  // Try to learn the identity from the id_token (JWT payload), best-effort.
  const email = emailFromIdToken(tokens);

  await setV271Tokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
  });

  return { email };
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

async function exchangeCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const config = await getV271Config();
  return invoke<TokenResponse>("oauth_exchange_token", {
    tokenUrl: resolveUrl(config.identityUrl ?? "", "token"),
    code,
    clientId,
    redirectUri,
    codeVerifier,
    clientSecret: null,
    scope: null,
  });
}

function emailFromIdToken(tokens: TokenResponse): string | null {
  if (!tokens.id_token) return null;
  const payload = tokens.id_token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      email?: string;
    };
    return json.email ?? null;
  } catch {
    return null;
  }
}

/** A usable access token, refreshing first when it is near expiry. */
export async function getV271AccessToken(): Promise<string | null> {
  const tokens = await getV271Tokens();
  if (!tokens.accessToken) return null;

  // Refresh 5 minutes before expiry, like the Gmail client does.
  const expiresAt = tokens.expiresAt ?? 0;
  if (tokens.refreshToken && expiresAt - 5 * 60_000 < Date.now()) {
    const refreshed = await refreshV271Token(tokens.refreshToken);
    await setV271Tokens({
      accessToken: refreshed.access_token,
      expiresAt: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
    });
    return refreshed.access_token;
  }
  return tokens.accessToken;
}

async function refreshV271Token(refreshToken: string): Promise<TokenResponse> {
  const config = await getV271Config();
  if (!config.identityUrl || !config.clientId) {
    throw new Error("V271 identity server or client id is not configured");
  }
  return invoke<TokenResponse>("oauth_refresh_token", {
    tokenUrl: resolveUrl(config.identityUrl, "token"),
    refreshToken,
    clientId: config.clientId,
    clientSecret: null,
    scope: null,
  });
}

export function isSignedIn(tokens: V271Tokens): boolean {
  return !!tokens.accessToken;
}