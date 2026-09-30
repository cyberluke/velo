import { invoke } from "@tauri-apps/api/core";
import { errorMessage, reportError } from "@/stores/toastStore";

/** Native status strings stay open so a newer backend remains inspectable. */
export interface SemanticSearchStatus {
  supported: boolean;
  enabled: boolean;
  // disabled | connecting | indexing | ready | error | no_gateway
  state: string;
  // ready | error | missing
  modelState: string;
  downloadedBytes: number;
  totalBytes: number | null;
  indexedDocuments: number | null;
  message: string | null;
  dataPath: string;
  modelId: string;
  datasets: string[];
  hasApiKey: boolean;
}

export interface GatewayModel {
  id: string;
  kind: string;
  dimensions: number | null;
  maxLength: number | null;
}

/** One indexable row. createdAt is unix seconds (the gateway stores it as is). */
export interface IndexItem {
  id: string;
  text: string;
  title?: string;
  createdAt?: number;
  kind?: string;
}

// Serialize status reads and mutations, including across panel remounts.
// A rejected command must not prevent subsequent retries.
let commandTail: Promise<unknown> = Promise.resolve();
// Shared by mutations, Settings reads, and the application observer. Retain
// failures until a healthy snapshot so dismissing a toast does not recreate it.
const reportedFailures = new Set<string>();

function reportRuntimeFailure(title: string, error: unknown) {
  const detail = errorMessage(error) || "Unknown native error";
  const signature = detail.trim();
  if (reportedFailures.has(signature)) return;
  reportedFailures.add(signature);
  reportError(title, detail);
}

const COMMAND_FAILURES: Record<string, string> = {
  semantic_search_status: "Could not read search status",
  semantic_search_set_enabled: "Could not change search activation",
  semantic_search_configure: "Could not save the gateway settings",
  semantic_search_list_models: "Could not list gateway models",
  semantic_search_reindex: "Could not update the mail index",
  semantic_search_upsert_batch: "Could not send an index batch",
  semantic_search_gc: "Could not clean up the index",
  semantic_search_finish_index: "Could not finish the index update",
  semantic_search_index_error: "Could not record the index failure",
};

function reportStatusFailure(status: SemanticSearchStatus) {
  const quiet = !status.supported || status.state === "unsupported" ||
    status.state === "disabled" || status.state === "connecting" ||
    status.state === "no_gateway" || status.state === "cancelled" || status.state === "canceled";
  const failed = status.state === "error" || status.state === "conflict" || status.modelState === "error";
  if (quiet || !failed) {
    reportedFailures.clear();
    return;
  }
  const detail = status.message || "Semantic search could not run. Open Settings > General for status and recovery controls.";
  reportRuntimeFailure("Semantic search needs attention", detail);
}

function command(
  name: string,
  args?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<SemanticSearchStatus> {
  const result = commandTail.then(() => {
    // Unmount cancels queued work; an IPC already sent cannot be cancelled here.
    if (signal?.aborted) throw new Error("Semantic search request cancelled");
    return invoke<SemanticSearchStatus>(name, args).then(
      (status) => {
        if (name === "semantic_search_status" && signal?.aborted) return status;
        // Report before the component checks its abort signal: already-sent
        // commands can fail or return an error status after Settings closes.
        reportStatusFailure(status);
        return status;
      },
      (error: unknown) => {
        const title = COMMAND_FAILURES[name] ?? "Semantic search request failed";
        if (name !== "semantic_search_status" || !signal?.aborted) {
          reportRuntimeFailure(title, error);
        }
        throw error;
      },
    );
  });
  commandTail = result.then(() => undefined, () => undefined);
  return result;
}

export function getSemanticSearchStatus(signal?: AbortSignal) {
  return command("semantic_search_status", undefined, signal);
}

/** Read-only app-lifetime observer; never enables, downloads, or indexes mail. */
export function startSemanticSearchStatusObserver(): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function poll() {
    if (controller.signal.aborted) return;
    try {
      // The first snapshot also reports failures from native autoresume.
      await getSemanticSearchStatus(controller.signal);
    } catch {
      // The shared command wrapper reports real IPC failures once. Cleanup
      // cancellations are silent; neither path escapes as an unhandled promise.
    } finally {
      if (!controller.signal.aborted) {
        timer = setTimeout(() => void poll(), 5000);
      }
    }
  }

  void poll();
  return () => {
    controller.abort();
    if (timer !== undefined) clearTimeout(timer);
  };
}

export function setSemanticSearchEnabled(enabled: boolean, signal?: AbortSignal) {
  return command("semantic_search_set_enabled", { enabled }, signal);
}

export function configureSemanticSearch(
  url: string,
  apiKey: string,
  model: string,
  datasets: string[],
  signal?: AbortSignal,
) {
  return command("semantic_search_configure", { url, apiKey, model, datasets }, signal);
}

export async function listSemanticSearchModels(): Promise<GatewayModel[]> {
  return invoke<GatewayModel[]>("semantic_search_list_models");
}

/** Non-destructive incremental rescan; the gateway reuses existing embeddings. */
export function reindexSemanticSearch(signal?: AbortSignal) {
  return command("semantic_search_reindex", undefined, signal);
}

export function upsertSemanticSearchBatch(dataset: string, items: IndexItem[]) {
  return invoke<SemanticSearchStatus>("semantic_search_upsert_batch", { dataset, items });
}

export function gcSemanticSearch(dataset: string) {
  return invoke<SemanticSearchStatus>("semantic_search_gc", { dataset });
}

export function finishSemanticSearchIndex() {
  return invoke<SemanticSearchStatus>("semantic_search_finish_index");
}

export function failSemanticSearchIndex(message: string) {
  return invoke<SemanticSearchStatus>("semantic_search_index_error", { message });
}