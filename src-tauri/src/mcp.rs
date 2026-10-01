use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

const DEFAULT_PORT: u16 = 17321;
const PROTOCOL_VERSION: &str = "2025-03-26";

static RUNNING: AtomicBool = AtomicBool::new(false);
static BOUND_PORT: AtomicU16 = AtomicU16::new(0);

type Pending = Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>;

#[derive(Default)]
struct ServerState {
    handle: Mutex<Option<JoinHandle<()>>>,
    pending: Pending,
}

#[derive(Serialize, Clone)]
struct McpFrontendRequest {
    id: String,
    name: String,
    arguments: Value,
}

#[derive(Deserialize)]
pub struct McpToolResponse {
    pub id: String,
    pub result: Option<Value>,
    pub error: Option<String>,
}

fn server_state(app: &AppHandle) -> Arc<ServerState> {
    if let Some(existing) = app.try_state::<Arc<ServerState>>() {
        return existing.inner().clone();
    }
    let state = Arc::new(ServerState::default());
    app.manage(state.clone());
    state
}

fn tools_list() -> Value {
    json!([
        {
            "name": "search_emails",
            "description": "Search mail by subject, body, sender, and operators (from:, after:, has:attachment).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "limit": { "type": "number" }
                },
                "required": ["query"]
            }
        },
        {
            "name": "search_invoices",
            "description": "Find invoices and receipts in subjects, bodies, PDF filenames, and extracted attachment text. Matches invoice, faktura, faktury, hóa đơn.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "after": { "type": "string" },
                    "before": { "type": "string" },
                    "limit": { "type": "number" }
                },
                "required": ["query"]
            }
        },
        {
            "name": "get_email",
            "description": "Fetch one message body and its attachments.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "accountId": { "type": "string" },
                    "messageId": { "type": "string" }
                },
                "required": ["accountId", "messageId"]
            }
        },
        {
            "name": "search_calendar",
            "description": "Search calendar events by text and optional time range.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "start": { "type": "string" },
                    "end": { "type": "string" }
                }
            }
        },
        {
            "name": "list_calendar",
            "description": "List calendar events in a date range.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "start": { "type": "string" },
                    "end": { "type": "string" }
                },
                "required": ["start", "end"]
            }
        },
        {
            "name": "list_folders",
            "description": "List the mailbox folders/labels for an account.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "accountId": { "type": "string" }
                }
            }
        },
        {
            "name": "get_thread",
            "description": "Fetch a full thread: subject, messages with sender, date and preview.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "accountId": { "type": "string" },
                    "threadId": { "type": "string" },
                    "limit": { "type": "number" }
                },
                "required": ["threadId"]
            }
        },
        {
            "name": "create_draft",
            "description": "Create a draft email (no send) with the given recipients, subject and body.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "accountId": { "type": "string" },
                    "to": { "type": "array", "items": { "type": "string" } },
                    "subject": { "type": "string" },
                    "body": { "type": "string" }
                },
                "required": ["to"]
            }
        }
    ])
}

fn json_rpc_result(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn json_rpc_error(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

async fn handle_rpc(app: &AppHandle, pending: &Pending, body: &str) -> Value {
    let parsed: Value = match serde_json::from_str(body) {
        Ok(value) => value,
        Err(_) => return json_rpc_error(&Value::Null, -32700, "Parse error"),
    };
    let method = parsed.get("method").and_then(Value::as_str).unwrap_or("");
    let id = parsed.get("id").cloned().unwrap_or(Value::Null);
    let params = parsed.get("params").cloned().unwrap_or(json!({}));

    match method {
        "initialize" => json_rpc_result(
            &id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "naiemail", "version": env!("CARGO_PKG_VERSION") }
            }),
        ),
        "notifications/initialized" | "ping" => json_rpc_result(&id, json!({})),
        "tools/list" => json_rpc_result(&id, json!({ "tools": tools_list() })),
        "tools/call" => {
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                return json_rpc_error(&id, -32602, "tool name is required");
            }
            let arguments = params.get("arguments").cloned().unwrap_or(json!({}));
            let request_id = format!("mcp-{}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0));
            let (tx, rx) = oneshot::channel();
            pending.lock().unwrap().insert(request_id.clone(), tx);
            let emitted = app.emit(
                "naiemail-mcp-request",
                McpFrontendRequest {
                    id: request_id.clone(),
                    name,
                    arguments,
                },
            );
            if emitted.is_err() {
                pending.lock().unwrap().remove(&request_id);
                return json_rpc_error(&id, -32000, "frontend is not listening");
            }
            match tokio::time::timeout(Duration::from_secs(20), rx).await {
                Ok(Ok(result)) => {
                    if let Some(message) = result.get("error").and_then(Value::as_str) {
                        json_rpc_error(&id, -32000, message)
                    } else {
                        json_rpc_result(
                            &id,
                            json!({
                                "content": [{
                                    "type": "text",
                                    "text": serde_json::to_string_pretty(result.get("result").unwrap_or(&result)).unwrap_or_else(|_| "{}".into())
                                }]
                            }),
                        )
                    }
                }
                _ => {
                    pending.lock().unwrap().remove(&request_id);
                    json_rpc_error(&id, -32000, "tool timed out")
                }
            }
        }
        "" => json_rpc_error(&id, -32600, "Invalid Request"),
        _ => json_rpc_error(&id, -32601, "Method not found"),
    }
}

async fn write_http(stream: &mut tokio::net::TcpStream, status: &str, body: &str, content_type: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;
}

async fn read_http(stream: &mut tokio::net::TcpStream) -> Result<String, ()> {
    let mut data = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let n = stream.read(&mut chunk).await.map_err(|_| ())?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&chunk[..n]);
        if let Some(pos) = data.windows(4).position(|w| w == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&data[..pos]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    if name.eq_ignore_ascii_case("content-length") {
                        value.trim().parse::<usize>().ok()
                    } else {
                        None
                    }
                })
                .unwrap_or(0);
            while data.len() < pos + 4 + content_length {
                let n = stream.read(&mut chunk).await.map_err(|_| ())?;
                if n == 0 {
                    break;
                }
                data.extend_from_slice(&chunk[..n]);
            }
            break;
        }
        if data.len() > 2 * 1024 * 1024 {
            break;
        }
    }
    Ok(String::from_utf8_lossy(&data).into_owned())
}

fn request_target(raw: &str) -> (String, String, String) {
    let mut lines = raw.split("\r\n");
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_string();
    let path = parts.next().unwrap_or("/").to_string();
    let body = raw.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
    (method, path, body)
}

async fn serve(app: AppHandle, pending: Pending, port: u16) {
    let listener = match TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(err) => {
            log::error!("MCP server failed to bind {port}: {err}");
            RUNNING.store(false, Ordering::SeqCst);
            return;
        }
    };
    BOUND_PORT.store(port, Ordering::SeqCst);
    RUNNING.store(true, Ordering::SeqCst);
    log::info!("MCP server listening on 127.0.0.1:{port}");

    loop {
        if !RUNNING.load(Ordering::SeqCst) {
            break;
        }
        let accepted = tokio::time::timeout(Duration::from_millis(400), listener.accept()).await;
        let Ok(Ok((mut stream, _))) = accepted else {
            continue;
        };
        let raw = match read_http(&mut stream).await {
            Ok(raw) => raw,
            Err(_) => continue,
        };
        let (method, path, body) = request_target(&raw);
        if method == "OPTIONS" {
            write_http(&mut stream, "204 No Content", "", "text/plain").await;
            continue;
        }
        if method == "GET" && (path == "/health" || path == "/") {
            let body = format!(
                "{{\"ok\":true,\"endpoint\":\"http://127.0.0.1:{port}/mcp\"}}"
            );
            write_http(&mut stream, "200 OK", &body, "application/json").await;
            continue;
        }
        if path != "/mcp" && path != "/mcp/" {
            write_http(&mut stream, "404 Not Found", "{\"error\":\"not found\"}", "application/json").await;
            continue;
        }
        let reply = handle_rpc(&app, &pending, &body).await;
        write_http(
            &mut stream,
            "200 OK",
            &reply.to_string(),
            "application/json",
        )
        .await;
    }
}

#[tauri::command]
pub async fn mcp_start(app: AppHandle, port: Option<u16>) -> Result<u16, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if RUNNING.load(Ordering::SeqCst) {
        return Ok(BOUND_PORT.load(Ordering::SeqCst));
    }
    let state = server_state(&app);
    let pending = state.pending.clone();
    let handle = tokio::spawn(serve(app.clone(), pending, port));
    *state.handle.lock().unwrap() = Some(handle);
    for _ in 0..20 {
        if RUNNING.load(Ordering::SeqCst) {
            return Ok(BOUND_PORT.load(Ordering::SeqCst));
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    if RUNNING.load(Ordering::SeqCst) {
        Ok(BOUND_PORT.load(Ordering::SeqCst))
    } else {
        Err("MCP server did not start".into())
    }
}

#[tauri::command]
pub async fn mcp_stop(app: AppHandle) -> Result<(), String> {
    RUNNING.store(false, Ordering::SeqCst);
    BOUND_PORT.store(0, Ordering::SeqCst);
    if let Some(handle) = server_state(&app).handle.lock().unwrap().take() {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_status() -> serde_json::Value {
    let port = BOUND_PORT.load(Ordering::SeqCst);
    json!({
        "running": RUNNING.load(Ordering::SeqCst),
        "port": port,
        "endpoint": if port > 0 {
            format!("http://127.0.0.1:{port}/mcp")
        } else {
            format!("http://127.0.0.1:{DEFAULT_PORT}/mcp")
        }
    })
}

#[tauri::command]
pub fn mcp_respond(app: AppHandle, payload: McpToolResponse) -> Result<(), String> {
    let pending = server_state(&app).pending.clone();
    let sender = pending
        .lock()
        .unwrap()
        .remove(&payload.id)
        .ok_or_else(|| "unknown MCP request".to_string())?;
    let body = if let Some(error) = payload.error {
        json!({ "error": error })
    } else {
        json!({ "result": payload.result.unwrap_or(Value::Null) })
    };
    sender.send(body).map_err(|_| "MCP waiter gone".to_string())
}
