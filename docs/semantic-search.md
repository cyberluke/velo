# Semantic search over the NPU retrieval gateway

Velo's semantic search is a thin client of the shared retrieval gateway
(OpenVINO on an Intel NPU + Qdrant, see the Zoo-Code `infra/openvino-npu`
stack). Velo no longer bundles a Typesense server, a Node worker, or an
embedding model; there is no platform gate — the gateway path runs identically
on Windows, macOS and Linux.

## Architecture

- The gateway is canonical for every desktop AI app: per-app instruction
  profiles, per-app Qdrant collections, stable point IDs, payload filters,
  int8 quantization, server-side reranking, and per-app telemetry.
- Velo registers as the `velo` app (mail instruction profile) and never talks
  to Qdrant directly.
- Indexing is frontend-driven: Settings (or the startup timer) runs
  `runSemanticSearchIndexer()`, which pages messages, extracted attachment
  text and calendar events out of SQLite and streams 64-item batches to
  `semantic_search_upsert_batch`. The gateway derives stable point IDs, so
  re-indexing is idempotent; `semantic_search_gc` prunes points deleted from
  the local database after each dataset pass.
- The Rust side (`src-tauri/src/semantic_search.rs`) is a gateway client:
  private `config.json` (enabled, URL, optional API key, model, datasets),
  a status state machine, and HTTP calls. No child processes, no ports, no
  lock files.
- `semantic_search_status` auto-rechecks the gateway when it was unreachable,
  so the settings panel recovers without user action.

## Bounds

Index chunks are truncated to ~1500 chars (~512 tokens at the gateway's
512-token embedding profile), keeping index throughput high on the 13 TOPS
NPU. Batches of 64 keep interactive query latency responsive during a
reindex. Reranking happens server-side on the top candidates.

## Settings

Settings > General shows the connection form (gateway URL, optional API key —
an empty field keeps the saved key — model picker from `/v1/models`, dataset
checkboxes) plus the enable toggle, status, indexed count and Update index.

Mail and embeddings stay on the computer; the gateway binds 127.0.0.1 only.
Search inside Velo continues to use its existing full-text search; the
semantic runtime serves the search model and its index to the gateway
ecosystem.