import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { dispatchMcpTool } from "./tools";
import { DEFAULT_MCP_PORT } from "./protocol";
import { getSetting } from "@/services/db/settings";

let unlisten: (() => void) | undefined;
let starting: Promise<void> | null = null;

interface McpRequestEvent {
  id: string;
  name: string;
  arguments: unknown;
}

export async function startMcpBridge(): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    const enabled = (await getSetting("mcp_enabled")) !== "false";
    if (!enabled) return;
    const portRaw = await getSetting("mcp_port");
    const port = portRaw ? Number(portRaw) : DEFAULT_MCP_PORT;
    unlisten?.();
    unlisten = await listen<McpRequestEvent>("velo-mcp-request", async (event) => {
      try {
        const result = await dispatchMcpTool(event.payload.name, event.payload.arguments);
        await invoke("mcp_respond", { payload: { id: event.payload.id, result } });
      } catch (err) {
        await invoke("mcp_respond", {
          payload: {
            id: event.payload.id,
            error: err instanceof Error ? err.message : String(err),
          },
        }).catch(() => {});
      }
    });
    await invoke("mcp_start", { port: Number.isFinite(port) ? port : DEFAULT_MCP_PORT });
  })().finally(() => {
    starting = null;
  });
  return starting;
}

export async function stopMcpBridge(): Promise<void> {
  unlisten?.();
  unlisten = undefined;
  await invoke("mcp_stop").catch(() => {});
}

export async function setMcpEnabled(enabled: boolean, port = DEFAULT_MCP_PORT): Promise<string> {
  if (enabled) {
    unlisten?.();
    unlisten = await listen<McpRequestEvent>("velo-mcp-request", async (event) => {
      try {
        const result = await dispatchMcpTool(event.payload.name, event.payload.arguments);
        await invoke("mcp_respond", { payload: { id: event.payload.id, result } });
      } catch (err) {
        await invoke("mcp_respond", {
          payload: {
            id: event.payload.id,
            error: err instanceof Error ? err.message : String(err),
          },
        }).catch(() => {});
      }
    });
    const bound = await invoke<number>("mcp_start", { port });
    return `http://127.0.0.1:${bound}/mcp`;
  }
  await stopMcpBridge();
  return `http://127.0.0.1:${port}/mcp`;
}
