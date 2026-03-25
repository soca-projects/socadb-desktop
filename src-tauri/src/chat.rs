use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

struct AgentProcess {
    stdin: tokio::process::ChildStdin,
}

struct AgentState {
    process: Option<AgentProcess>,
    api_key: Option<String>,
}

static AGENT: std::sync::OnceLock<Arc<Mutex<AgentState>>> = std::sync::OnceLock::new();

fn get_agent() -> &'static Arc<Mutex<AgentState>> {
    AGENT.get_or_init(|| {
        Arc::new(Mutex::new(AgentState {
            process: None,
            api_key: None,
        }))
    })
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

async fn spawn_agent(app: &AppHandle, api_key: Option<&str>) -> Result<AgentProcess, String> {
    let mut cmd = Command::new("npx");
    cmd.args(["tsx", &agent_runner_path()])
        .current_dir(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .join("mcp-server"),
        )
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(key) = api_key {
        cmd.env("ANTHROPIC_API_KEY", key);
    }

    let mut child = cmd
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
        guard.process = None;
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

    Ok(AgentProcess { stdin })
}

async fn ensure_agent(app: &AppHandle) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;

    if guard.process.is_some() {
        return Ok(());
    }

    let process = spawn_agent(app, guard.api_key.as_deref()).await?;
    guard.process = Some(process);
    Ok(())
}

async fn send_to_agent_inner(cmd: &serde_json::Value) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    let process = guard.process.as_mut().ok_or("Agent not running")?;
    let line = serde_json::to_string(cmd).map_err(|e| e.to_string())?;
    process
        .stdin
        .write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|e| {
            guard.process = None;
            format!("Failed to write to agent: {e}")
        })
}

async fn send_to_agent(app: &AppHandle, cmd: &serde_json::Value) -> Result<(), String> {
    if let Ok(()) = send_to_agent_inner(cmd).await {
        return Ok(());
    }

    eprintln!("[chat] Agent dead, restarting...");
    ensure_agent(app).await?;
    send_to_agent_inner(cmd).await
}

#[derive(Serialize, Clone)]
struct StreamEvent {
    raw: String,
}

#[tauri::command]
pub async fn chat_init(app: AppHandle) -> Result<(), String> {
    ensure_agent(&app).await?;
    send_to_agent(&app, &serde_json::json!({ "type": "chat_init" })).await
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
    send_to_agent(
        &app,
        &serde_json::json!({
            "type": "chat_send",
            "message": message,
            "systemPrompt": system_prompt,
            "sessionId": session_id,
            "model": model,
        }),
    )
    .await
}

#[tauri::command]
pub async fn chat_stop(app: AppHandle) -> Result<(), String> {
    send_to_agent(&app, &serde_json::json!({ "type": "chat_stop" })).await
}

#[tauri::command]
pub async fn chat_status(app: AppHandle) -> Result<(), String> {
    ensure_agent(&app).await?;
    send_to_agent(&app, &serde_json::json!({ "type": "chat_status" })).await
}

#[tauri::command]
pub async fn chat_set_api_key(api_key: Option<String>) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    guard.api_key = api_key;
    guard.process = None;
    Ok(())
}

#[tauri::command]
pub async fn chat_reset() -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    guard.process = None;
    Ok(())
}
