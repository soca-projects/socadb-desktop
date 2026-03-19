mod chat;
mod ws;

use tauri::Manager;
use tokio_tungstenite::tungstenite::Message;

#[tauri::command]
fn get_mcp_binary_path(app: tauri::AppHandle) -> Result<String, String> {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        other => return Err(format!("Unsupported OS: {other}")),
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        other => other,
    };
    let ext = if os == "windows" { ".exe" } else { "" };
    let binary_name = format!("socadb-mcp-{os}-{arch}{ext}");

    let path = if cfg!(debug_assertions) {
        // Dev: binary is in mcp-server/dist/ relative to the project root
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        manifest_dir
            .parent()
            .ok_or("Cannot resolve project root")?
            .join("mcp-server")
            .join("dist")
            .join(&binary_name)
    } else {
        // Prod: binary is bundled in the app resources
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join(&binary_name)
    };

    if !path.exists() {
        return Err(format!("MCP binary not found: {}", path.display()));
    }

    path.to_str()
        .ok_or_else(|| format!("Path is not valid UTF-8: {}", path.display()))
        .map(|s| s.to_owned())
}

#[tauri::command]
async fn mcp_respond(response: String) {
    let sender = ws::get_ws_sender();
    let mut guard = sender.lock().await;
    if let Some(ref mut ws) = *guard {
        use futures_util::SinkExt;
        let _ = ws.send(Message::Text(response)).await;
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_mcp_binary_path,
            mcp_respond,
            chat::detect_provider,
            chat::chat_send,
            chat::chat_stop,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let port = ws::start_ws_server(handle).await;
                eprintln!("SocaDB MCP WebSocket server on port {port}");
            });
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                ws::cleanup_port_file();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
