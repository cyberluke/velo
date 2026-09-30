//! Velo semantic search over the shared NPU retrieval gateway.
//!
//! The gateway (OpenVINO on an Intel NPU + Qdrant) is the canonical
//! embedding/reranking/vector-store service for every desktop AI app. Velo is
//! a thin client: no bundled runtime, no child processes, no platform gate,
//! no local model downloads. The same code path runs on Windows, macOS and
//! Linux; indexing and search work wherever the gateway is reachable.
//!
//! Reindexing is driven from the frontend (which owns SQLite access): the
//! settings flow streams rows through `semantic_search_upsert_batch`, then
//! `semantic_search_gc` prunes stale points per dataset and
//! `semantic_search_finish_index` marks the run complete. Point IDs are
//! stable hashes derived by the gateway, so re-running an index is
//! idempotent. No child output or API response is ever copied to status.
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use tokio_util::sync::CancellationToken;

const APP_ID: &str = "velo";
const DEFAULT_URL: &str = "http://127.0.0.1:8010";
const DEFAULT_MODEL: &str = "Qwen3-Embedding-0.6B-int4";
const DEFAULT_DATASETS: [&str; 3] = ["messages", "attachments", "calendar"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    supported: bool,
    enabled: bool,
    // disabled | connecting | indexing | ready | error | no_gateway
    state: String,
    // ready | error | missing
    model_state: String,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    indexed_documents: Option<u64>,
    message: Option<String>,
    data_path: String,
    model_id: String,
    datasets: Vec<String>,
    has_api_key: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    enabled: bool,
    url: String,
    api_key: String,
    model: String,
    datasets: Vec<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            enabled: false,
            url: DEFAULT_URL.into(),
            api_key: String::new(),
            model: DEFAULT_MODEL.into(),
            datasets: DEFAULT_DATASETS.iter().map(|d| d.to_string()).collect(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayModel {
    id: String,
    kind: String,
    dimensions: Option<u64>,
    max_length: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexItem {
    id: String,
    text: String,
    title: Option<String>,
    created_at: Option<i64>,
    kind: Option<String>,
}

struct Inner {
    status: Status,
    config: Config,
    generation: u64,
    cancel: CancellationToken,
    closing: bool,
    run_id: Option<i64>,
    last_check: Option<Instant>,
}

pub struct SemanticSearchManager {
    root: PathBuf,
    client: reqwest::Client,
    inner: Mutex<Inner>,
    // Serialize short mutations and gateway transitions, never a batch
    // transfer or readiness request.
    transition: Mutex<()>,
}

fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn private_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid semantic search file path.")?;
    fs::create_dir_all(parent).map_err(|_| "Cannot create the private semantic search directory.".to_string())?;
    let temp = parent.join(".velo-config.tmp");
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        let mut file = options.open(&temp).map_err(|_| "Cannot create private search configuration.".to_string())?;
        file.write_all(bytes).and_then(|_| file.sync_all())
            .map_err(|_| "Cannot save private search configuration.".to_string())?;
        fs::rename(&temp, path).map_err(|_| "Cannot install private search configuration.".to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(temp); }
    result
}

fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|_| "Cannot encode semantic search configuration.".to_string())
}

fn valid_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

impl SemanticSearchManager {
    fn new(app: &tauri::AppHandle) -> Self {
        let data = app.path().app_data_dir().ok();
        let supported = data.is_some();
        let root = data.map(|p| p.join("semantic-search")).unwrap_or_default();
        let mut config = Config::default();
        let mut config_error: Option<String> = None;
        match fs::read(root.join("config.json")) {
            Ok(bytes) => match serde_json::from_slice::<Config>(&bytes) {
                Ok(cfg) => {
                    if !valid_url(&cfg.url) {
                        config_error = Some("The saved gateway URL is invalid. Re-enter it in Settings.".into());
                    } else {
                        config = cfg;
                    }
                }
                Err(_) => config_error = Some("Private semantic search configuration is invalid. Restore config.json before retrying.".into()),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => config_error = Some("Cannot read private semantic search configuration.".into()),
        }
        let status = Status {
            supported,
            enabled: config.enabled,
            state: if config.enabled { "connecting".into() } else { "disabled".into() },
            model_state: "missing".into(),
            downloaded_bytes: 0,
            total_bytes: None,
            indexed_documents: None,
            message: config_error.clone().or_else(|| {
                config.enabled.then(|| "Connecting to the NPU retrieval gateway.".into())
            }),
            data_path: config.url.clone(),
            model_id: config.model.clone(),
            datasets: config.datasets.clone(),
            has_api_key: !config.api_key.is_empty(),
        };
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .build()
            .expect("Cannot build the gateway HTTP client");
        Self {
            root,
            client,
            inner: Mutex::new(Inner {
                status,
                config,
                generation: 0,
                cancel: CancellationToken::new(),
                closing: false,
                run_id: None,
                last_check: None,
            }),
            transition: Mutex::new(()),
        }
    }

    fn status(&self) -> Status {
        self.inner.lock().unwrap().status.clone()
    }

    fn current(&self, generation: u64) -> bool {
        let inner = self.inner.lock().unwrap();
        !inner.closing && inner.generation == generation && !inner.cancel.is_cancelled()
    }

    fn publish(&self, generation: u64, update: impl FnOnce(&mut Status)) {
        let mut inner = self.inner.lock().unwrap();
        if inner.closing || inner.generation != generation { return; }
        update(&mut inner.status);
    }

    async fn gateway(&self, config: &Config, path: &str, method: reqwest::Method, body: Option<serde_json::Value>, timeout: Duration) -> Result<reqwest::Response, String> {
        let mut request = self
            .client
            .request(method, format!("{}{}", config.url.trim_end_matches('/'), path))
            .timeout(timeout);
        if !config.api_key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", config.api_key));
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        request.send().await.map_err(|e| format!("The retrieval gateway is not reachable at {}: {}", config.url, e))
    }

    /// One-shot gateway health check. Auto-recovers when the gateway appears.
    fn check_gateway(self: &Arc<Self>, generation: u64, token: CancellationToken) {
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let config = manager.inner.lock().unwrap().config.clone();
            let response = manager.gateway(&config, "/readyz", reqwest::Method::GET, None, Duration::from_secs(8)).await;
            if token.is_cancelled() || !manager.current(generation) { return; }
            match response {
                Ok(response) if response.status().is_success() => {
                    // Register Velo's instruction profile once the gateway is
                    // reachable (idempotent on the gateway side), so searches
                    // use the mail/calendar instruction rather than neutral.
                    let registration = manager.gateway(
                        &config,
                        "/v1/apps",
                        reqwest::Method::POST,
                        Some(serde_json::json!({
                            "app_id": APP_ID,
                            "display_name": "Velo mail",
                            "based_on": "mail",
                        })),
                        Duration::from_secs(8),
                    )
                    .await;
                    if token.is_cancelled() || !manager.current(generation) { return; }
                    let _ = registration; // a refused registration must not fail the feature
                    manager.publish(generation, |s| {
                        s.model_state = "ready".into();
                        if s.state == "connecting" || s.state == "no_gateway" {
                            s.state = "ready".into();
                            s.message = None;
                        }
                    });
                }
                Ok(response) => {
                    let body = response.text().await.unwrap_or_default();
                    let detail = if body.len() > 300 { &body[..300] } else { &body };
                    manager.publish(generation, |s| {
                        s.model_state = "error".into();
                        s.state = "no_gateway".into();
                        s.message = Some(format!("The retrieval gateway is starting or busy: {detail}"));
                    });
                }
                Err(error) => {
                    manager.publish(generation, |s| {
                        s.model_state = "error".into();
                        s.state = "no_gateway".into();
                        s.message = Some(error);
                    });
                }
            }
        });
    }

    /// Status reads retry the health check when the gateway is not up yet,
    /// so the settings panel recovers without user action.
    fn maybe_recheck(self: &Arc<Self>) {
        let mut inner = self.inner.lock().unwrap();
        if inner.closing || !inner.status.enabled { return; }
        if inner.status.state == "ready" || inner.status.state == "indexing" { return; }
        if inner.last_check.is_some_and(|at| at.elapsed() < Duration::from_secs(3)) { return; }
        inner.last_check = Some(Instant::now());
        let generation = inner.generation;
        let token = inner.cancel.clone();
        drop(inner);
        self.check_gateway(generation, token);
    }

    fn resume(self: &Arc<Self>) {
        let inner = self.inner.lock().unwrap();
        if inner.closing || !inner.config.enabled { return; }
        let generation = inner.generation;
        let token = inner.cancel.clone();
        drop(inner);
        self.check_gateway(generation, token);
    }

    fn persist(&self, config: &Config) -> Result<(), String> {
        private_write(&self.root.join("config.json"), &encode(config)?)
    }

    fn set_enabled(self: &Arc<Self>, enabled: bool) -> Result<Status, String> {
        let _transition = self.transition.lock().unwrap();
        let mut inner = self.inner.lock().unwrap();
        if inner.closing { return Err("Velo is quitting.".into()); }
        if inner.status.enabled == enabled { return Ok(inner.status.clone()); }
        let mut config = inner.config.clone();
        config.enabled = enabled;
        // Failure to persist disabling must not leave a live indexer running.
        let saved = self.persist(&config);
        if enabled { saved.as_ref().map_err(|error| error.clone())?; }
        inner.config = config;
        inner.status.enabled = enabled;
        inner.status.state = if enabled { "connecting".into() } else { "disabled".into() };
        inner.status.message = if enabled { Some("Connecting to the NPU retrieval gateway.".into()) } else { None };
        if !enabled {
            inner.status.model_state = "missing".into();
            inner.run_id = None;
            inner.status.indexed_documents = None;
        }
        if let Err(error) = saved {
            inner.status.state = "error".into();
            inner.status.message = Some(error.clone());
            return Err(error);
        }
        let generation = inner.generation;
        let token = inner.cancel.clone();
        drop(inner);
        if enabled { self.check_gateway(generation, token); }
        Ok(self.status())
    }

    fn configure(self: &Arc<Self>, url: String, api_key: String, model: String, datasets: Vec<String>) -> Result<Status, String> {
        let _transition = self.transition.lock().unwrap();
        let url = url.trim().to_string();
        if !valid_url(&url) {
            return Err("The gateway URL must start with http:// or https://".into());
        }
        let mut datasets: Vec<String> = datasets.into_iter().filter(|d| !d.trim().is_empty()).map(|d| d.trim().to_string()).collect();
        datasets.sort();
        datasets.dedup();
        if datasets.is_empty() {
            return Err("Choose at least one dataset to index.".into());
        }
        let mut inner = self.inner.lock().unwrap();
        if inner.closing { return Err("Velo is quitting.".into()); }
        inner.config.url = url;
        // An empty api_key keeps the saved key (the UI cannot read the key
        // back); a non-empty value replaces it.
        if !api_key.trim().is_empty() {
            inner.config.api_key = api_key.trim().to_string();
        }
        inner.config.model = if model.trim().is_empty() { DEFAULT_MODEL.into() } else { model.trim().into() };
        inner.config.datasets = datasets;
        self.persist(&inner.config)?;
        inner.status.data_path = inner.config.url.clone();
        inner.status.model_id = inner.config.model.clone();
        inner.status.datasets = inner.config.datasets.clone();
        inner.status.has_api_key = !inner.config.api_key.is_empty();
        if inner.status.enabled {
            inner.status.state = "connecting".into();
            inner.status.message = Some("Connecting to the NPU retrieval gateway.".into());
            let generation = inner.generation;
            let token = inner.cancel.clone();
            drop(inner);
            self.check_gateway(generation, token);
        }
        Ok(self.status())
    }

    async fn list_models(self: &Arc<Self>) -> Result<Vec<GatewayModel>, String> {
        let config = self.inner.lock().unwrap().config.clone();
        let response = self.gateway(&config, "/v1/models", reqwest::Method::GET, None, Duration::from_secs(8)).await
            .map_err(|e| format!("Could not list gateway models: {e}"))?
            .error_for_status()
            .map_err(|e| format!("The gateway rejected the model list request: {e}"))?;
        let body = response.json::<serde_json::Value>().await
            .map_err(|_| "The gateway returned an invalid model list.".to_string())?;
        let models = body.get("models").and_then(|m| m.as_array()).ok_or("The gateway returned an invalid model list.")?;
        let mut result = Vec::new();
        for model in models {
            result.push(GatewayModel {
                id: model.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                kind: model.get("kind").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                dimensions: model.get("dimensions").and_then(|v| v.as_u64()),
                max_length: model.get("max_length").and_then(|v| v.as_u64()),
            });
        }
        Ok(result)
    }

    /// Refresh indexedDocuments from the gateway count endpoint.
    async fn refresh_count(self: &Arc<Self>, generation: u64) {
        let config = self.inner.lock().unwrap().config.clone();
        let response = self.gateway(&config, &format!("/v1/index/count?app_id={APP_ID}"), reqwest::Method::GET, None, Duration::from_secs(8)).await;
        if !self.current(generation) { return; }
        if let Ok(response) = response {
            if response.status().is_success() {
                if let Ok(value) = response.json::<serde_json::Value>().await {
                    if let Some(points) = value.get("points").and_then(|v| v.as_u64()) {
                        self.publish(generation, |s| s.indexed_documents = Some(points));
                    }
                }
            }
        }
    }

    fn reindex(self: &Arc<Self>) -> Result<Status, String> {
        let _transition = self.transition.lock().unwrap();
        let mut inner = self.inner.lock().unwrap();
        if inner.closing { return Err("Velo is quitting.".into()); }
        if !inner.status.enabled { return Err("Enable semantic search before updating the index.".into()); }
        if inner.status.model_state != "ready" {
            return Err("The retrieval gateway is not ready. Check the connection in Settings.".into());
        }
        if inner.status.state == "indexing" { return Ok(inner.status.clone()); }
        inner.status.state = "indexing".into();
        inner.status.message = Some("Updating the mail index through the NPU retrieval gateway.".into());
        inner.run_id = Some(unix_seconds());
        Ok(inner.status.clone())
    }

    async fn upsert_batch(self: &Arc<Self>, dataset: String, items: Vec<IndexItem>) -> Result<Status, String> {
        let (run_id, config, generation) = {
            let inner = self.inner.lock().unwrap();
            if inner.closing { return Err("Velo is quitting.".into()); }
            let run_id = inner.run_id.ok_or_else(|| "Start an index update before sending batches.".to_string())?;
            (run_id, inner.config.clone(), inner.generation)
        };
        let payload = serde_json::json!({
            "app_id": APP_ID,
            "dataset": dataset,
            "run_id": run_id,
            "items": items.iter().map(|item| serde_json::json!({
                "id": item.id,
                "text": item.text,
                "payload": {
                    "title": item.title,
                    "created_at": item.created_at,
                    "kind": item.kind,
                }
            })).collect::<Vec<_>>(),
        });
        // Upsert batches embed serially on the NPU; allow a long tail under load.
        let response = self.gateway(&config, "/v1/index/upsert", reqwest::Method::POST, Some(payload), Duration::from_secs(120)).await?
            .error_for_status().map_err(|e| format!("The gateway rejected the index batch: {e}"))?;
        let _value: serde_json::Value = response.json().await.map_err(|_| "The gateway returned an invalid index response.".to_string())?;
        self.refresh_count(generation).await;
        Ok(self.status())
    }

    async fn gc(self: &Arc<Self>, dataset: String) -> Result<Status, String> {
        let (run_id, config) = {
            let inner = self.inner.lock().unwrap();
            if inner.closing { return Err("Velo is quitting.".into()); }
            let run_id = inner.run_id.ok_or_else(|| "Start an index update before collecting stale points.".to_string())?;
            (run_id, inner.config.clone())
        };
        let payload = serde_json::json!({"app_id": APP_ID, "dataset": dataset, "keep_run_id": run_id});
        self.gateway(&config, "/v1/index/gc", reqwest::Method::POST, Some(payload), Duration::from_secs(30)).await?
            .error_for_status().map_err(|e| format!("The gateway rejected the index cleanup: {e}"))?;
        Ok(self.status())
    }

    fn finish_index(self: &Arc<Self>) -> Result<Status, String> {
        let _transition = self.transition.lock().unwrap();
        let mut inner = self.inner.lock().unwrap();
        if inner.closing { return Err("Velo is quitting.".into()); }
        inner.status.state = "ready".into();
        inner.status.message = None;
        inner.run_id = None;
        Ok(inner.status.clone())
    }

    fn index_error(self: &Arc<Self>, message: String) -> Result<Status, String> {
        let _transition = self.transition.lock().unwrap();
        let mut inner = self.inner.lock().unwrap();
        if inner.closing { return Err("Velo is quitting.".into()); }
        inner.status.state = "error".into();
        inner.status.message = Some(message);
        inner.run_id = None;
        Ok(inner.status.clone())
    }

    pub fn shutdown(&self) {
        let mut inner = self.inner.lock().unwrap();
        if inner.closing { return; }
        inner.closing = true;
        inner.cancel.cancel();
        inner.generation += 1;
        inner.run_id = None;
    }
}

pub fn install(app: &tauri::AppHandle) {
    let manager = Arc::new(SemanticSearchManager::new(app));
    app.manage(manager.clone());
    manager.resume();
}

#[tauri::command]
pub fn semantic_search_status(manager: tauri::State<'_, Arc<SemanticSearchManager>>) -> Status {
    let manager = manager.inner().clone();
    manager.maybe_recheck();
    let (enabled, indexing, generation) = {
        let inner = manager.inner.lock().unwrap();
        (inner.status.enabled, inner.status.state == "indexing", inner.generation)
    };
    // Keep the indexed count fresh while enabled so the panel and observer
    // show progress without extra round trips from the frontend.
    if enabled && !indexing {
        let manager_for_count = manager.clone();
        tauri::async_runtime::spawn(async move { manager_for_count.refresh_count(generation).await; });
    }
    manager.status()
}

#[tauri::command]
pub async fn semantic_search_set_enabled(manager: tauri::State<'_, Arc<SemanticSearchManager>>, enabled: bool) -> Result<Status, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.set_enabled(enabled)).await
        .map_err(|_| "Semantic search settings task failed.".to_string())?
}

#[tauri::command]
pub async fn semantic_search_configure(manager: tauri::State<'_, Arc<SemanticSearchManager>>, url: String, api_key: String, model: String, datasets: Vec<String>) -> Result<Status, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.configure(url, api_key, model, datasets)).await
        .map_err(|_| "Semantic search configuration task failed.".to_string())?
}

#[tauri::command]
pub async fn semantic_search_list_models(manager: tauri::State<'_, Arc<SemanticSearchManager>>) -> Result<Vec<GatewayModel>, String> {
    let manager = manager.inner().clone();
    manager.list_models().await
}

#[tauri::command]
pub async fn semantic_search_reindex(manager: tauri::State<'_, Arc<SemanticSearchManager>>) -> Result<Status, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.reindex()).await
        .map_err(|_| "Mail reindex task could not start.".to_string())?
}

#[tauri::command]
pub async fn semantic_search_upsert_batch(manager: tauri::State<'_, Arc<SemanticSearchManager>>, dataset: String, items: Vec<IndexItem>) -> Result<Status, String> {
    let manager = manager.inner().clone();
    manager.upsert_batch(dataset, items).await
}

#[tauri::command]
pub async fn semantic_search_gc(manager: tauri::State<'_, Arc<SemanticSearchManager>>, dataset: String) -> Result<Status, String> {
    let manager = manager.inner().clone();
    manager.gc(dataset).await
}

#[tauri::command]
pub async fn semantic_search_finish_index(manager: tauri::State<'_, Arc<SemanticSearchManager>>) -> Result<Status, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.finish_index()).await
        .map_err(|_| "Index completion task failed.".to_string())?
}

#[tauri::command]
pub async fn semantic_search_index_error(manager: tauri::State<'_, Arc<SemanticSearchManager>>, message: String) -> Result<Status, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.index_error(message)).await
        .map_err(|_| "Index error task failed.".to_string())?
}