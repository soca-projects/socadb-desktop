mod chat;
mod ws;

use std::process::Command;
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
fn read_schema_file(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    let canonical = p
        .canonicalize()
        .map_err(|e| format!("Failed to read file: {e}"))?;
    if !canonical
        .to_string_lossy()
        .to_lowercase()
        .ends_with(".soca")
    {
        return Err("Only .soca files are allowed".into());
    }
    std::fs::read_to_string(&canonical).map_err(|e| format!("Failed to read file: {e}"))
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

#[tauri::command]
fn open_terminal() {
    #[cfg(target_os = "macos")]
    {
        let terminals = ["Ghostty", "iTerm", "Warp", "Alacritty", "kitty", "Terminal"];
        for app in terminals {
            if let Ok(output) = Command::new("open").args(["-a", app]).output() {
                if output.status.success() {
                    break;
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let terminals = ["wt.exe", "powershell.exe"];
        for term in terminals {
            if Command::new(term).spawn().is_ok() {
                break;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let terminals = ["gnome-terminal", "konsole", "xfce4-terminal", "xterm"];
        for term in terminals {
            if Command::new(term).spawn().is_ok() {
                break;
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_mcp_binary_path,
            read_schema_file,
            mcp_respond,
            open_terminal,
            chat::chat_init,
            chat::chat_send,
            chat::chat_stop,
            chat::chat_status,
            chat::chat_set_api_key,
            chat::chat_reset,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match ws::start_ws_server(handle).await {
                    Ok(_port) => {
                        #[cfg(debug_assertions)]
                        eprintln!("SocaDB MCP WebSocket server on port {_port}");
                    }
                    Err(e) => eprintln!("Failed to start WebSocket server: {e}"),
                }
            });
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                chat::cleanup_agents();
                ws::cleanup_port_file();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
