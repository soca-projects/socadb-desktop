use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

struct AgentProcess {
    stdin: tokio::process::ChildStdin,
    pid: Option<u32>,
}

struct AgentState {
    processes: HashMap<String, AgentProcess>,
    api_keys: HashMap<String, String>,
}

static AGENT: std::sync::OnceLock<Arc<Mutex<AgentState>>> = std::sync::OnceLock::new();

fn get_agent() -> &'static Arc<Mutex<AgentState>> {
    AGENT.get_or_init(|| {
        Arc::new(Mutex::new(AgentState {
            processes: HashMap::new(),
            api_keys: HashMap::new(),
        }))
    })
}

fn kill_process(pid: u32) {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .arg(pid.to_string())
            .output();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output();
    }
}

fn kill_and_remove_agent(processes: &mut HashMap<String, AgentProcess>, provider_id: &str) {
    if let Some(process) = processes.remove(provider_id) {
        if let Some(pid) = process.pid {
            kill_process(pid);
        }
    }
}

pub fn cleanup_agents() {
    match get_agent().try_lock() {
        Ok(mut guard) => {
            for process in guard.processes.values() {
                if let Some(pid) = process.pid {
                    kill_process(pid);
                }
            }
            guard.processes.clear();
        }
        Err(_) => {
            eprintln!("[chat] Could not acquire lock during cleanup, agent processes may linger");
        }
    }
}

fn agent_runner_path(provider_id: &str) -> String {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let filename = format!("agent-runner-{provider_id}.ts");
    manifest_dir
        .parent()
        .unwrap()
        .join("mcp-server")
        .join("src")
        .join(filename)
        .to_string_lossy()
        .to_string()
}

fn api_key_env_var(provider_id: &str) -> &'static str {
    match provider_id {
        "codex" => "OPENAI_API_KEY",
        _ => "ANTHROPIC_API_KEY",
    }
}

async fn spawn_agent(
    app: &AppHandle,
    provider_id: &str,
    api_key: Option<&str>,
) -> Result<AgentProcess, String> {
    let mut cmd = Command::new("bun");
    cmd.args([&agent_runner_path(provider_id)])
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
        cmd.env(api_key_env_var(provider_id), key);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn agent-runner-{provider_id}: {e}"))?;

    let child_pid = child.id();
    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    let pid = provider_id.to_string();
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
        guard.processes.remove(&pid);
    });

    if let Some(stderr) = stderr {
        let pid = provider_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[agent-runner-{pid}] {line}");
            }
        });
    }

    Ok(AgentProcess {
        stdin,
        pid: child_pid,
    })
}

async fn ensure_agent(app: &AppHandle, provider_id: &str) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;

    if guard.processes.contains_key(provider_id) {
        return Ok(());
    }

    let api_key = guard.api_keys.get(provider_id).cloned();
    let process = spawn_agent(app, provider_id, api_key.as_deref()).await?;
    guard.processes.insert(provider_id.to_string(), process);
    Ok(())
}

async fn send_to_agent_inner(provider_id: &str, cmd: &serde_json::Value) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    let process = guard
        .processes
        .get_mut(provider_id)
        .ok_or("Agent not running")?;
    let line = serde_json::to_string(cmd).map_err(|e| e.to_string())?;
    process
        .stdin
        .write_all(format!("{line}\n").as_bytes())
        .await
        .map_err(|e| {
            guard.processes.remove(provider_id);
            format!("Failed to write to agent: {e}")
        })
}

async fn send_to_agent(
    app: &AppHandle,
    provider_id: &str,
    cmd: &serde_json::Value,
) -> Result<(), String> {
    if send_to_agent_inner(provider_id, cmd).await.is_ok() {
        return Ok(());
    }

    eprintln!("[chat] Agent {provider_id} dead, restarting...");
    ensure_agent(app, provider_id).await?;
    send_to_agent_inner(provider_id, cmd).await
}

#[derive(Serialize, Clone)]
struct StreamEvent {
    raw: String,
}

#[tauri::command]
pub async fn chat_init(app: AppHandle, provider_id: String) -> Result<(), String> {
    ensure_agent(&app, &provider_id).await?;
    send_to_agent(
        &app,
        &provider_id,
        &serde_json::json!({ "type": "chat_init" }),
    )
    .await
}

#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    provider_id: String,
    message: String,
    system_prompt: String,
    session_id: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    ensure_agent(&app, &provider_id).await?;
    send_to_agent(
        &app,
        &provider_id,
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
pub async fn chat_stop(app: AppHandle, provider_id: String) -> Result<(), String> {
    send_to_agent(
        &app,
        &provider_id,
        &serde_json::json!({ "type": "chat_stop" }),
    )
    .await
}

#[tauri::command]
pub async fn chat_status(app: AppHandle, provider_id: String) -> Result<(), String> {
    ensure_agent(&app, &provider_id).await?;
    send_to_agent(
        &app,
        &provider_id,
        &serde_json::json!({ "type": "chat_status" }),
    )
    .await
}

#[tauri::command]
pub async fn chat_set_api_key(provider_id: String, api_key: Option<String>) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    match api_key {
        Some(key) => {
            guard.api_keys.insert(provider_id.clone(), key);
        }
        None => {
            guard.api_keys.remove(&provider_id);
        }
    }
    kill_and_remove_agent(&mut guard.processes, &provider_id);
    Ok(())
}

#[tauri::command]
pub async fn chat_reset(provider_id: String) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    kill_and_remove_agent(&mut guard.processes, &provider_id);
    Ok(())
}
