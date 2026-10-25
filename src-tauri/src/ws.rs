use futures_util::{SinkExt, StreamExt};
use log::Level;
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

type WsSink = Arc<
    Mutex<
        futures_util::stream::SplitSink<
            tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
            Message,
        >,
    >,
>;
type WsClients = Arc<Mutex<HashMap<u64, WsSink>>>;

static WS_CLIENTS: std::sync::OnceLock<WsClients> = std::sync::OnceLock::new();
static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);
const MIN_BACKOFF: std::time::Duration = std::time::Duration::from_millis(100);
const MAX_BACKOFF: std::time::Duration = std::time::Duration::from_secs(5);

fn get_clients() -> &'static WsClients {
    WS_CLIENTS.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

pub async fn send_to_client(connection_id: u64, message: String) {
    let Some(sink) = get_clients().lock().await.get(&connection_id).cloned() else {
        return;
    };
    let sent = sink.lock().await.send(Message::Text(message.into())).await;
    if let Err(e) = sent {
        crate::log_event!(Level::Warn, "mcp.ws.send_failed", e, "connection" => connection_id);
        get_clients().lock().await.remove(&connection_id);
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
        match write_port_file(port) {
            Ok(()) => {
                crate::log_event!(Level::Info, "mcp.ws.listening", "MCP bridge listening", "port" => port)
            }
            Err(e) => crate::log_event!(Level::Error, "mcp.port_file.write_failed", e),
        }
        let mut backoff = MIN_BACKOFF;
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    backoff = MIN_BACKOFF;
                    tokio::spawn(handle_connection(stream, app.clone()));
                }
                // One failed accept (too many open files, a reset) must not end the bridge.
                Err(e) => {
                    crate::log_event!(Level::Warn, "mcp.ws.accept_failed", e);
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(MAX_BACKOFF);
                }
            }
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
            crate::log_event!(Level::Debug, "mcp.ws.handshake_failed", e);
            return;
        }
    };

    let connection_id = NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed);
    let (sender, mut receiver) = ws_stream.split();

    {
        let mut clients = get_clients().lock().await;
        clients.insert(connection_id, Arc::new(Mutex::new(sender)));
    }
    crate::log_event!(Level::Debug, "mcp.ws.connected", "MCP client connected", "connection" => connection_id);

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let payload = format!("{{\"connectionId\":{connection_id},\"data\":{text}}}",);
                let _ = app.emit("mcp-request", payload);
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                crate::log_event!(Level::Warn, "mcp.ws.receive_failed", e, "connection" => connection_id);
                break;
            }
            _ => {}
        }
    }

    {
        let mut clients = get_clients().lock().await;
        clients.remove(&connection_id);
    }
    crate::log_event!(Level::Debug, "mcp.ws.disconnected", "MCP client disconnected", "connection" => connection_id);
}

fn write_port_file(port: u16) -> Result<(), String> {
    let dir = dirs::home_dir().ok_or("No home directory")?.join(".socadb");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(".port"), port.to_string()).map_err(|e| e.to_string())
}

pub fn cleanup_port_file() {
    if let Some(home) = dirs::home_dir() {
        let _ = std::fs::remove_file(home.join(".socadb").join(".port"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

    async fn register(
        connection_id: u64,
    ) -> WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>> {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            tokio_tungstenite::accept_async(stream).await.unwrap()
        });
        let (client, _) = tokio_tungstenite::connect_async(format!("ws://{addr}"))
            .await
            .unwrap();
        let (sink, _) = server.await.unwrap().split();
        get_clients()
            .lock()
            .await
            .insert(connection_id, Arc::new(Mutex::new(sink)));
        client
    }

    #[tokio::test]
    async fn a_client_that_stops_reading_does_not_block_the_others() {
        let _stuck = register(1001).await;
        let mut live = register(1002).await;

        let blocked = tokio::spawn(send_to_client(1001, "x".repeat(32 << 20)));
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert!(!blocked.is_finished());

        tokio::time::timeout(Duration::from_secs(5), send_to_client(1002, "ping".into()))
            .await
            .expect("the send to the live client waited on the stuck one");
        let received = live.next().await.unwrap().unwrap();
        assert_eq!(received.into_text().unwrap().as_str(), "ping");

        blocked.abort();
        get_clients().lock().await.clear();
    }
}
