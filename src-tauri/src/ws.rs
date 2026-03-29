use futures_util::StreamExt;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

type WsSender = Arc<
    Mutex<
        Option<
            futures_util::stream::SplitSink<
                tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
                Message,
            >,
        >,
    >,
>;

static WS_SENDER: std::sync::OnceLock<WsSender> = std::sync::OnceLock::new();

pub fn get_ws_sender() -> &'static WsSender {
    WS_SENDER.get_or_init(|| Arc::new(Mutex::new(None)))
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

async fn handle_connection(stream: tokio::net::TcpStream, app: AppHandle) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("WebSocket handshake error: {e}");
            return;
        }
    };

    let (sender, mut receiver) = ws_stream.split();

    {
        let mut ws = get_ws_sender().lock().await;
        *ws = Some(sender);
    }

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let _ = app.emit("mcp-request", text.to_string());
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    {
        let mut ws = get_ws_sender().lock().await;
        *ws = None;
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
