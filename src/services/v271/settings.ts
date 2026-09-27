import { getSetting, setSetting, getSecureSetting, setSecureSetting } from "@/services/db/settings";

/**
 * V271 configuration. Everything is stored in the settings key-value store;
 * tokens go through the encrypted secure settings (AES-256-GCM, key in the
 * OS credential store) — the same path used for Gmail and IMAP credentials.
 *
 * The endpoints are configuration, not code: V271 is an external platform
 * whose instance URL is chosen when the app is registered.
 */

const PREFIX = "v271_";

export interface V271Config {
  enabled: boolean;
  identityUrl: string | null;
  graphUrl: string | null;
  clientId: string | null;
}

export async function getV271Config(): Promise<V271Config> {
  const [enabled, identityUrl, graphUrl, clientId] = await Promise.all([
    getSetting(`${PREFIX}enabled`),
    getSetting(`${PREFIX}identity_url`),
    getSetting(`${PREFIX}graph_url`),
    getSetting(`${PREFIX}client_id`),
  ]);
  return {
    enabled: enabled === "true",
    identityUrl,
    graphUrl,
    clientId,
  };
}

export async function setV271Config(config: Partial<V271Config>): Promise<void> {
  const writes: Promise<unknown>[] = [];
  if (config.enabled !== undefined) {
    writes.push(setSetting(`${PREFIX}enabled`, String(config.enabled)));
  }
  if (config.identityUrl !== undefined) {
    writes.push(setSetting(`${PREFIX}identity_url`, config.identityUrl ?? ""));
  }
  if (config.graphUrl !== undefined) {
    writes.push(setSetting(`${PREFIX}graph_url`, config.graphUrl ?? ""));
  }
  if (config.clientId !== undefined) {
    writes.push(setSetting(`${PREFIX}client_id`, config.clientId ?? ""));
  }
  await Promise.all(writes);
}

/** Scopes requested from the V271 identity server. */
export const V271_SCOPES = [
  "openid",
  "profile",
  "email",
  "graph.readwrite",
].join(" ");

export interface V271Tokens {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

/** Token accessors — secure settings, so they are encrypted at rest. */
export async function getV271Tokens(): Promise<V271Tokens> {
  const [accessToken, refreshToken, expiresAt] = await Promise.all([
    getSecureSetting(`${PREFIX}access_token`),
    getSecureSetting(`${PREFIX}refresh_token`),
    getSecureSetting(`${PREFIX}expires_at`),
  ]);
  return {
    accessToken: accessToken || null,
    refreshToken: refreshToken || null,
    expiresAt: expiresAt ? parseInt(expiresAt, 10) : null,
  };
}

export async function setV271Tokens(tokens: Partial<V271Tokens>): Promise<void> {
  const writes: Promise<unknown>[] = [];
  if (tokens.accessToken !== undefined) {
    writes.push(setSecureSetting(`${PREFIX}access_token`, tokens.accessToken ?? ""));
  }
  if (tokens.refreshToken !== undefined) {
    writes.push(setSecureSetting(`${PREFIX}refresh_token`, tokens.refreshToken ?? ""));
  }
  if (tokens.expiresAt !== undefined) {
    writes.push(
      tokens.expiresAt === null
        ? setSecureSetting(`${PREFIX}expires_at`, "")
        : setSecureSetting(`${PREFIX}expires_at`, String(tokens.expiresAt)),
    );
  }
  await Promise.all(writes);
}

export async function clearV271Tokens(): Promise<void> {
  await setV271Tokens({ accessToken: null, refreshToken: null, expiresAt: null });
}

/** Whether the app is registered and can push to the graph. */
export async function isV271Ready(): Promise<boolean> {
  const config = await getV271Config();
  return config.enabled && !!config.graphUrl && !!config.clientId;
}