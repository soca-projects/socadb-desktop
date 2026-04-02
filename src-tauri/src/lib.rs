mod chat;
mod ws;

use std::process::Command;
use tauri::Manager;

const KEYRING_SERVICE: &str = "socadb-desktop";

#[tauri::command]
fn keyring_get(account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn keyring_set(account: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
fn keyring_delete(account: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

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
async fn mcp_respond(connection_id: u64, response: String) {
    ws::send_to_client(connection_id, response).await;
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
            keyring_get,
            keyring_set,
            keyring_delete,
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
