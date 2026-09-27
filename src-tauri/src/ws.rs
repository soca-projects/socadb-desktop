use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::accept_hdr_async;
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;

type WsSink = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    Message,
>;
type WsClients = Arc<Mutex<HashMap<u64, WsSink>>>;

static WS_CLIENTS: std::sync::OnceLock<WsClients> = std::sync::OnceLock::new();
static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

fn get_clients() -> &'static WsClients {
    WS_CLIENTS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

pub async fn send_to_client(connection_id: u64, message: String) {
    let mut clients = get_clients().lock().await;
    if let Some(sink) = clients.get_mut(&connection_id) {
        if sink.send(Message::Text(message)).await.is_err() {
            clients.remove(&connection_id);
        }
    }
}

pub async fn start_ws_server(app: AppHandle) -> Result<u16, String> {
    cleanup_port_file();

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind WebSocket: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local address: {e}"))?
        .port();

    tokio::spawn(async move {
        write_port_file(port);
        while let Ok((stream, _)) = listener.accept().await {
            let app = app.clone();
            tokio::spawn(handle_connection(stream, app));
        }
    });

    Ok(port)
}

// Browsers always send Origin on a WebSocket handshake and our MCP clients
// never do; without this, any web page could find the port and drive the app.
#[allow(clippy::result_large_err)] // signature fixed by tungstenite's handshake Callback
fn reject_browser_origin(request: &Request, response: Response) -> Result<Response, ErrorResponse> {
    if request.headers().contains_key("origin") {
        let mut error = ErrorResponse::new(None);
        *error.status_mut() = StatusCode::FORBIDDEN;
        return Err(error);
    }
    Ok(response)
}

async fn handle_connection(stream: tokio::net::TcpStream, app: AppHandle) {
    let ws_stream = match accept_hdr_async(stream, reject_browser_origin).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake error: {e}");
            return;
        }
    };

    let connection_id = NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed);
    let (sender, mut receiver) = ws_stream.split();

    {
        let mut clients = get_clients().lock().await;
        clients.insert(connection_id, sender);
    }

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let payload = format!("{{\"connectionId\":{connection_id},\"data\":{text}}}",);
                let _ = app.emit("mcp-request", payload);
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    {
        let mut clients = get_clients().lock().await;
        clients.remove(&connection_id);
    }
}

fn write_port_file(port: u16) {
    if let Some(home) = dirs::home_dir() {
        let dir = home.join(".socadb");
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(".port"), port.to_string());
    }
}

pub fn cleanup_port_file() {
    if let Some(home) = dirs::home_dir() {
        let _ = std::fs::remove_file(home.join(".socadb").join(".port"));
    }
}
