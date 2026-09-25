use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::KEYRING_SERVICE;

#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum LoginType {
    Subscription,
    ApiKey,
}

// CREATE_NO_WINDOW flag for Windows CreateProcess. Without this, every
// bun.exe / taskkill.exe subprocess flashes a console window because they
// are console applications and Tauri's main process is a GUI app — Windows
// allocates a fresh console whenever a console subprocess is spawned from
// a GUI parent. The flag suppresses the allocation entirely.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

struct AgentProcess {
    stdin: tokio::process::ChildStdin,
    pid: Option<u32>,
    // Tells the exit watcher whether the map entry is still this process or a
    // replacement spawned after an auth change.
    generation: u64,
    // What auth state the running agent was spawned with. Compared on each
    // `ensure_agent` so a switch (subscription ↔ api-key, key rotation)
    // picks up at the next user message via a lazy respawn rather than a
    // synchronous signal that would interrupt streams.
    spawned_auth: SpawnedAuth,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SpawnedAuth {
    Subscription,
    ApiKey(u64),
    ApiKeyMissing,
}

struct AgentState {
    processes: HashMap<String, AgentProcess>,
}

static AGENT: std::sync::OnceLock<Arc<Mutex<AgentState>>> = std::sync::OnceLock::new();
static NEXT_GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn get_agent() -> &'static Arc<Mutex<AgentState>> {
    AGENT.get_or_init(|| {
        Arc::new(Mutex::new(AgentState {
            processes: HashMap::new(),
        }))
    })
}

enum KeyringLookup {
    Found(String),
    Empty,
    Error,
}

// Distinguishes "no key on file" from "couldn't read the keyring right now"
// so `ensure_agent` can preserve a working agent through a transient backend
// hiccup (locked Gnome keyring, denied macOS prompt, DBus blip on Linux)
// instead of killing it and respawning with no auth.
fn read_keyring_api_key(provider_id: &str) -> KeyringLookup {
    match keyring::Entry::new(KEYRING_SERVICE, provider_id) {
        Err(_) => KeyringLookup::Error,
        Ok(entry) => match entry.get_password() {
            Ok(pw) => KeyringLookup::Found(pw),
            Err(keyring::Error::NoEntry) => KeyringLookup::Empty,
            Err(_) => KeyringLookup::Error,
        },
    }
}

fn hash_key(key: &str) -> u64 {
    let mut h = DefaultHasher::new();
    key.hash(&mut h);
    h.finish()
}

// Fallback for hosts whose OS keyring isn't usable. Reads the plaintext copy
// the frontend wrote into ~/.socadb/config.json when `keyring_set` failed.
// Always preferred behind the keyring; this is only consulted when the
// keyring returns Empty (no entry on a working backend).
fn read_plaintext_api_key(app: &AppHandle, provider_id: &str) -> Option<String> {
    let home = app.path().home_dir().ok()?;
    let config_path = home.join(".socadb").join("config.json");
    let content = std::fs::read_to_string(&config_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    json.get("apiKeys")?
        .get(provider_id)?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from)
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
            .creation_flags(CREATE_NO_WINDOW)
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

pub struct RuntimeLayout {
    pub dir: PathBuf,
    pub bun: PathBuf,
}

pub fn resolve_runtime_layout(app: &AppHandle) -> Result<RuntimeLayout, String> {
    let dir = if cfg!(debug_assertions) {
        // Dev: use mcp-server/dist/runtime if built, else fall back to mcp-server/src
        // (which still works because agent-runner-shared.ts looks in ../dist for the MCP binary).
        let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let project_root = manifest_dir.parent().ok_or("Cannot resolve project root")?;
        let runtime = project_root.join("mcp-server").join("dist").join("runtime");
        if runtime.exists() {
            runtime
        } else {
            project_root.join("mcp-server").join("src")
        }
    } else {
        app.path()
            .resource_dir()
            .map_err(|e| format!("Failed to resolve resource_dir: {e}"))?
            .join("runtime")
    };

    let bun_name = if cfg!(target_os = "windows") {
        "bun.exe"
    } else {
        "bun"
    };
    let bundled_bun = dir.join(bun_name);
    let bun = if bundled_bun.exists() {
        bundled_bun
    } else if cfg!(debug_assertions) {
        // Dev fallback: rely on system-installed bun (developer machine).
        PathBuf::from("bun")
    } else {
        return Err(format!(
            "Bun runtime not found in resources: {}",
            bundled_bun.display()
        ));
    };

    Ok(RuntimeLayout { dir, bun })
}

pub fn agent_runner_path(layout: &RuntimeLayout, provider_id: &str) -> PathBuf {
    layout.dir.join(format!("agent-runner-{provider_id}.ts"))
}

fn api_key_env_var(provider_id: &str) -> &'static str {
    match provider_id {
        // `codex exec` reads CODEX_API_KEY and ignores OPENAI_API_KEY.
        "codex" => "CODEX_API_KEY",
        _ => "ANTHROPIC_API_KEY",
    }
}

async fn spawn_agent(
    app: &AppHandle,
    provider_id: &str,
    api_key: Option<&str>,
    spawned_auth: SpawnedAuth,
) -> Result<AgentProcess, String> {
    let layout = resolve_runtime_layout(app)?;
    let runner = agent_runner_path(&layout, provider_id);

    if !runner.exists() {
        return Err(format!(
            "Agent runner not found: {} (runtime dir: {})",
            runner.display(),
            layout.dir.display()
        ));
    }

    let mut cmd = Command::new(&layout.bun);
    cmd.arg(&runner)
        .current_dir(&layout.dir)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    if let Some(key) = api_key {
        cmd.env(api_key_env_var(provider_id), key);
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn agent-runner-{provider_id}: {e} (bun: {}, runner: {})",
            layout.bun.display(),
            runner.display()
        )
    })?;

    let child_pid = child.id();
    let generation = NEXT_GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
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

        let status = child.wait().await;
        let mut guard = get_agent().lock().await;
        let is_current = guard
            .processes
            .get(&pid)
            .is_some_and(|p| p.generation == generation);
        if !is_current {
            // Killed on purpose (auth change, reset): the map already holds
            // its replacement, or nothing, and the exit is not an error.
            return;
        }
        guard.processes.remove(&pid);
        drop(guard);

        let exit_info = match status {
            Ok(s) if s.success() => return,
            Ok(s) => format!("Agent process exited with code {}", s.code().unwrap_or(-1)),
            Err(e) => format!("Agent process error: {e}"),
        };

        let event = serde_json::json!({
            "type": "chat_event",
            "event": "error",
            "message": exit_info,
            "providerId": pid,
        });
        let _ = app_clone.emit(
            "chat-stream",
            StreamEvent {
                raw: event.to_string(),
            },
        );
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
        generation,
        spawned_auth,
    })
}

async fn ensure_agent(
    app: &AppHandle,
    provider_id: &str,
    login_type: LoginType,
) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;

    // Resolve the auth state we want this agent to run with.
    // In subscription mode the keyring is intentionally ignored — even if a
    // key is stored there, the user explicitly chose CLI auth and we must
    // not inject it into the env (otherwise the SDK silently bills the API
    // key instead of the subscription).
    let (api_key, desired_auth) = match login_type {
        LoginType::Subscription => (None, SpawnedAuth::Subscription),
        LoginType::ApiKey => match read_keyring_api_key(provider_id) {
            KeyringLookup::Found(key) => {
                let hash = hash_key(&key);
                (Some(key), SpawnedAuth::ApiKey(hash))
            }
            // No keyring entry — check the plaintext fallback the frontend
            // writes when the OS keyring backend isn't usable.
            KeyringLookup::Empty => match read_plaintext_api_key(app, provider_id) {
                Some(key) => {
                    let hash = hash_key(&key);
                    (Some(key), SpawnedAuth::ApiKey(hash))
                }
                None => (None, SpawnedAuth::ApiKeyMissing),
            },
            // Keep an existing agent through a transient keyring backend
            // hiccup so a 50ms blip can't silently log the user out.
            KeyringLookup::Error => {
                if guard.processes.contains_key(provider_id) {
                    return Ok(());
                }
                match read_plaintext_api_key(app, provider_id) {
                    Some(key) => {
                        let hash = hash_key(&key);
                        (Some(key), SpawnedAuth::ApiKey(hash))
                    }
                    None => (None, SpawnedAuth::ApiKeyMissing),
                }
            }
        },
    };

    if let Some(existing) = guard.processes.get(provider_id) {
        if existing.spawned_auth == desired_auth {
            return Ok(());
        }
        kill_and_remove_agent(&mut guard.processes, provider_id);
    }

    let process = spawn_agent(app, provider_id, api_key.as_deref(), desired_auth).await?;
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
    login_type: LoginType,
    cmd: &serde_json::Value,
) -> Result<(), String> {
    if send_to_agent_inner(provider_id, cmd).await.is_ok() {
        return Ok(());
    }

    eprintln!("[chat] Agent {provider_id} dead, restarting...");
    ensure_agent(app, provider_id, login_type).await?;
    send_to_agent_inner(provider_id, cmd).await
}

#[derive(Serialize, Clone)]
struct StreamEvent {
    raw: String,
}

// Preheat the agent subprocess so the first chat_send doesn't pay the spawn cost.
#[tauri::command]
pub async fn chat_init(
    app: AppHandle,
    provider_id: String,
    login_type: LoginType,
) -> Result<(), String> {
    ensure_agent(&app, &provider_id, login_type).await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn chat_send(
    app: AppHandle,
    provider_id: String,
    login_type: LoginType,
    message: String,
    system_prompt: String,
    session_id: Option<String>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<(), String> {
    ensure_agent(&app, &provider_id, login_type).await?;
    send_to_agent(
        &app,
        &provider_id,
        login_type,
        &serde_json::json!({
            "type": "chat_send",
            "message": message,
            "systemPrompt": system_prompt,
            "sessionId": session_id,
            "model": model,
            "effort": effort,
        }),
    )
    .await
}

#[tauri::command]
pub async fn chat_stop(provider_id: String) -> Result<(), String> {
    // Best-effort: write a stop command if the agent is alive. If the process
    // is already gone there's nothing to stop — don't respawn just to send a
    // shutdown signal, that would be silly.
    let _ = send_to_agent_inner(&provider_id, &serde_json::json!({ "type": "chat_stop" })).await;
    Ok(())
}

#[tauri::command]
pub async fn chat_reset(provider_id: String) -> Result<(), String> {
    let agent = get_agent();
    let mut guard = agent.lock().await;
    kill_and_remove_agent(&mut guard.processes, &provider_id);
    Ok(())
}
