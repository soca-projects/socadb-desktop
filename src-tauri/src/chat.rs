use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

fn claude_path() -> String {
    if let Ok(path) = std::env::var("HOME") {
        let local_bin = format!("{path}/.local/bin/claude");
        if std::path::Path::new(&local_bin).exists() {
            return local_bin;
        }
    }
    "claude".to_string()
}

static CHILD_PID: std::sync::OnceLock<Arc<Mutex<Option<u32>>>> = std::sync::OnceLock::new();

fn get_child_pid() -> &'static Arc<Mutex<Option<u32>>> {
    CHILD_PID.get_or_init(|| Arc::new(Mutex::new(None)))
}

#[derive(Serialize, Clone)]
struct StreamEvent {
    raw: String,
}

#[derive(Serialize, Clone)]
struct DoneEvent {
    session_id: Option<String>,
}

#[derive(Serialize, Clone)]
struct ErrorEvent {
    error: String,
}

#[tauri::command]
pub async fn detect_provider() -> Result<serde_json::Value, String> {
    let bin = claude_path();

    let version_output = Command::new(&bin).arg("--version").output().await;

    let installed = matches!(version_output, Ok(ref o) if o.status.success());
    if !installed {
        return Ok(serde_json::json!({
            "installed": false,
            "authenticated": false,
            "email": null
        }));
    }

    let auth_output = Command::new(&bin).args(["auth", "status"]).output().await;

    match auth_output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(status) = serde_json::from_str::<serde_json::Value>(&stdout) {
                let authenticated = status
                    .get("loggedIn")
                    .or_else(|| status.get("authenticated"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let email = status
                    .get("email")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                Ok(serde_json::json!({
                    "installed": true,
                    "authenticated": authenticated,
                    "email": email
                }))
            } else {
                Ok(serde_json::json!({
                    "installed": true,
                    "authenticated": false,
                    "email": null
                }))
            }
        }
        _ => Ok(serde_json::json!({
            "installed": true,
            "authenticated": false,
            "email": null
        })),
    }
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    message: String,
    system_prompt: String,
    session_id: Option<String>,
) -> Result<(), String> {
    let mut args = vec![
        "-p".to_string(),
        message,
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--append-system-prompt".to_string(),
        system_prompt,
        "--allowedTools".to_string(),
        "mcp__socadb__*".to_string(),
    ];

    if let Some(sid) = session_id {
        args.push("--resume".to_string());
        args.push(sid);
    }

    let mut child = Command::new(claude_path())
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let pid = child.id();
    {
        let mut guard = get_child_pid().lock().await;
        *guard = pid;
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    let mut last_session_id: Option<String> = None;

    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
            if let Some(sid) = parsed.get("session_id").and_then(|v| v.as_str()) {
                last_session_id = Some(sid.to_string());
            }
        }

        let _ = app.emit("chat-stream", StreamEvent { raw: line });
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    {
        let mut guard = get_child_pid().lock().await;
        *guard = None;
    }

    if status.success() {
        let _ = app.emit(
            "chat-done",
            DoneEvent {
                session_id: last_session_id,
            },
        );
    } else {
        let _ = app.emit(
            "chat-error",
            ErrorEvent {
                error: format!("claude exited with status: {status}"),
            },
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn chat_stop() -> Result<(), String> {
    let mut guard = get_child_pid().lock().await;
    if let Some(pid) = guard.take() {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
    Ok(())
}
