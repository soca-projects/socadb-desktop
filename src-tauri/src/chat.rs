use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

struct AgentProcess {
    stdin: tokio::process::ChildStdin,
}

static AGENT: std::sync::OnceLock<Arc<Mutex<Option<AgentProcess>>>> = std::sync::OnceLock::new();

fn get_agent() -> &'static Arc<Mutex<Option<AgentProcess>>> {
    AGENT.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn agent_runner_path() -> String {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .unwrap()
        .join("mcp-server")
        .join("src")
        .join("agent-runner.ts")
        .to_string_lossy()
        .to_string()
}

async fn ensure_agent(app: &AppHandle) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;

    if guard.is_some() {
        return Ok(());
    }

    let mut child = Command::new("npx")
        .args(["tsx", &agent_runner_path()])
        .current_dir(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("mcp-server"),
        )
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent-runner: {e}"))?;

    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let _ = app_clone.emit("chat-stream", StreamEvent { raw: line });
        }

        let _ = child.wait().await;
        let mut guard = get_agent().lock().await;
        *guard = None;
    });

    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[agent-runner] {line}");
            }
        });
    }

    *guard = Some(AgentProcess { stdin });
    Ok(())
}

async fn send_to_agent(cmd: &serde_json::Value) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    let process = guard.as_mut().ok_or("Agent not running")?;
    let line = serde_json::to_string(cmd).map_err(|e| e.to_string())?;
    process
        .stdin
        .write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|e| format!("Failed to write to agent: {e}"))
}

#[derive(Serialize, Clone)]
struct StreamEvent {
    raw: String,
}

#[tauri::command]
pub async fn chat_init(app: AppHandle) -> Result<(), String> {
    ensure_agent(&app).await?;
    send_to_agent(&serde_json::json!({ "type": "chat_init" })).await
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    message: String,
    system_prompt: String,
    session_id: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    ensure_agent(&app).await?;
    send_to_agent(&serde_json::json!({
        "type": "chat_send",
        "message": message,
        "systemPrompt": system_prompt,
        "sessionId": session_id,
        "model": model,
    }))
    .await
}

#[tauri::command]
pub async fn chat_stop() -> Result<(), String> {
    send_to_agent(&serde_json::json!({ "type": "chat_stop" })).await
}

#[tauri::command]
pub async fn chat_status(app: AppHandle) -> Result<(), String> {
    ensure_agent(&app).await?;
    send_to_agent(&serde_json::json!({ "type": "chat_status" })).await
}
