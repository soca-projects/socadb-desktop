mod ws;

use tokio_tungstenite::tungstenite::Message;

#[tauri::command]
async fn mcp_respond(response: String) {
    let sender = ws::get_ws_sender();
    let mut guard = sender.lock().await;
    if let Some(ref mut ws) = *guard {
        use futures_util::SinkExt;
        let _ = ws.send(Message::Text(response.into())).await;
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![mcp_respond])
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
