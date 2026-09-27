import type { GraphSyncPayload } from "./types";
import { getV271Config } from "./settings";
import { getV271AccessToken } from "./identityClient";

/**
 * Transport for pushing graph sync payloads to the V271 Graph endpoint.
 *
 * The JSON contract is intentionally simple and versioned by the `client`
 * field in the payload: `POST {graphUrl}/graph/sync` with a bearer token
 * and `{ client, entities, edges, syncedAt }`. The server upserts entities
 * and edges by (type, sourceId), which is what keeps repeated pushes of the
 * same payload harmless.
 */

export interface GraphPushResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface GraphTransport {
  push(payload: GraphSyncPayload): Promise<GraphPushResult>;
}

/**
 * Real HTTP transport. Retries once after refreshing the access token when
 * the server answers 401 — a token that expired between the check and the
 * push is the common failure.
 */
export class HttpGraphTransport implements GraphTransport {
  async push(payload: GraphSyncPayload): Promise<GraphPushResult> {
    const config = await getV271Config();
    if (!config.graphUrl) {
      return { ok: false, error: "V271 graph URL is not configured" };
    }

    const token = await getV271AccessToken();
    if (!token) {
      return { ok: false, error: "Not signed in to V271" };
    }

    const url = `${config.graphUrl.replace(/\/+$/, "")}/graph/sync`;
    const body = JSON.stringify(payload);

    let response = await this.post(url, token, body);
    if (response.status === 401) {
      // Stale token — force a refresh and retry once.
      const fresh = await getV271AccessToken();
      if (!fresh) return { ok: false, status: 401, error: "V271 token refresh failed" };
      response = await this.post(url, fresh, body);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: text.slice(0, 500) };
    }
    return { ok: true, status: response.status };
  }

  private async post(url: string, token: string, body: string): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
    });
  }
}

/**
 * Records payloads instead of sending them — used by tests and by the
 * "dry run" path when the user has not configured a graph endpoint.
 */
export class RecordingGraphTransport implements GraphTransport {
  readonly pushed: GraphSyncPayload[] = [];

  async push(payload: GraphSyncPayload): Promise<GraphPushResult> {
    this.pushed.push(payload);
    return { ok: true };
  }

  clear(): void {
    this.pushed.length = 0;
  }
}

/** Returns the transport the sync engine should use right now. */
export async function resolveGraphTransport(): Promise<GraphTransport> {
  const config = await getV271Config();
  if (!config.enabled || !config.graphUrl) {
    return new RecordingGraphTransport();
  }
  return new HttpGraphTransport();
}