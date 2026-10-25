use log::Level;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, VecDeque};
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
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
// agent runner / taskkill.exe subprocess flashes a console window because they
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
}

// Error codes the frontend maps to translated messages.
const API_KEY_MISSING: &str = "api_key_missing";
const KEYRING_UNAVAILABLE: &str = "keyring_unavailable";

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

const STDERR_TAIL: usize = 20;

#[cfg(unix)]
fn exit_signal(status: &std::process::ExitStatus) -> Option<i32> {
    use std::os::unix::process::ExitStatusExt;
    status.signal()
}

#[cfg(not(unix))]
fn exit_signal(_: &std::process::ExitStatus) -> Option<i32> {
    None
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
    let result = keyring::Entry::new(KEYRING_SERVICE, provider_id).and_then(|e| e.get_password());
    match result {
        Ok(pw) => KeyringLookup::Found(pw),
        Err(keyring::Error::NoEntry) => KeyringLookup::Empty,
        Err(e) => {
            crate::log_event!(Level::Warn, "keyring.read.failed", e, "provider" => provider_id);
            KeyringLookup::Error
        }
    }
}

fn hash_key(key: &str) -> u64 {
    let mut h = DefaultHasher::new();
    key.hash(&mut h);
    h.finish()
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
            crate::log_event!(
                Level::Warn,
                "agent.cleanup.locked",
                "Could not lock the agents during cleanup; runner processes may linger"
            );
        }
    }
}

fn api_key_env_var(provider_id: &str) -> &'static str {
    match provider_id {
        // `codex exec` reads CODEX_API_KEY and ignores OPENAI_API_KEY.
        "codex" => "CODEX_API_KEY",
        _ => "ANTHROPIC_API_KEY",
    }
}

fn inherited_auth_env_vars(provider_id: &str) -> &'static [&'static str] {
    match provider_id {
        "codex" => &["CODEX_API_KEY", "OPENAI_API_KEY"],
        _ => &["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
    }
}

async fn spawn_agent(
    app: &AppHandle,
    provider_id: &str,
    api_key: Option<&str>,
    spawned_auth: SpawnedAuth,
) -> Result<AgentProcess, String> {
    let mcp = crate::mcp_binary_path(app).inspect_err(|e| {
        crate::log_event!(Level::Error, "agent.runtime.missing", e, "provider" => provider_id);
    })?;
    let runtime = mcp.with_file_name("runtime");
    if !runtime.is_dir() {
        let message = format!("Agent runtime not found: {}", runtime.display());
        crate::log_event!(Level::Error, "agent.runtime.missing", message, "provider" => provider_id);
        return Err(message);
    }

    let mut cmd = Command::new(&mcp);
    cmd.args(["agent", provider_id])
        .current_dir(&runtime)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match api_key {
        Some(key) => {
            cmd.env(api_key_env_var(provider_id), key);
        }
        // An inherited key would bill the API behind a subscription.
        None => {
            for var in inherited_auth_env_vars(provider_id) {
                cmd.env_remove(var);
            }
        }
    }

    let mut child = cmd.spawn().map_err(|e| {
        let message = format!(
            "Failed to spawn the {provider_id} agent: {e} ({})",
            mcp.display()
        );
        crate::log_event!(Level::Error, "agent.spawn.failed", message, "provider" => provider_id);
        message
    })?;

    let child_pid = child.id();
    let generation = NEXT_GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take();
    let stderr_tail = Arc::new(std::sync::Mutex::new(VecDeque::with_capacity(STDERR_TAIL)));

    let app_clone = app.clone();
    let pid = provider_id.to_string();
    let exit_tail = Arc::clone(&stderr_tail);
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
        // Killed on purpose: the entry is its replacement, or gone.
        if !is_current {
            return;
        }
        guard.processes.remove(&pid);
        drop(guard);

        let tail: Vec<String> = exit_tail
            .lock()
            .map(|t| t.iter().cloned().collect())
            .unwrap_or_default();
        let tail = if cfg!(debug_assertions) {
            tail
        } else {
            crate::logging::release_tail(&tail)
        };
        let exit_info = match status {
            Ok(s) if s.success() => {
                crate::log_event!(
                    Level::Warn,
                    "agent.exit.unexpected",
                    "Agent runner exited on its own",
                    "provider" => pid,
                    "stderr_tail" => tail,
                );
                return;
            }
            Ok(s) => match exit_signal(&s) {
                Some(signal) => {
                    let message = format!("Agent process killed by signal {signal}");
                    crate::log_event!(
                        Level::Error,
                        "agent.exit.signal",
                        message,
                        "provider" => pid,
                        "signal" => signal,
                        "stderr_tail" => tail,
                    );
                    message
                }
                None => {
                    let message =
                        format!("Agent process exited with code {}", s.code().unwrap_or(-1));
                    crate::log_event!(
                        Level::Error,
                        "agent.exit.nonzero",
                        message,
                        "provider" => pid,
                        "code" => s.code(),
                        "stderr_tail" => tail,
                    );
                    message
                }
            },
            Err(e) => {
                crate::log_event!(Level::Error, "agent.exit.wait_failed", e, "provider" => pid);
                format!("Agent process error: {e}")
            }
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
                let line = crate::logging::truncate(&line, crate::logging::MAX_STDERR_LINE);
                if let Ok(mut tail) = stderr_tail.lock() {
                    if tail.len() == STDERR_TAIL {
                        tail.pop_front();
                    }
                    tail.push_back(line.clone());
                }
                // Runners can echo request text: the full stream stays out of
                // release logs, which keep only the tail on a crash.
                crate::log_event!(Level::Debug, "agent.stderr", line, "provider" => pid);
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
            // A keyless agent would fall back to the CLI's own login and
            // bill the subscription the user opted out of.
            KeyringLookup::Empty => {
                kill_and_remove_agent(&mut guard.processes, provider_id);
                return Err(API_KEY_MISSING.into());
            }
            // Keep an agent already running on a key through a transient
            // keyring hiccup so a 50ms blip can't silently log the user out.
            KeyringLookup::Error => {
                let running_on_key = guard
                    .processes
                    .get(provider_id)
                    .is_some_and(|p| matches!(p.spawned_auth, SpawnedAuth::ApiKey(_)));
                if running_on_key {
                    return Ok(());
                }
                kill_and_remove_agent(&mut guard.processes, provider_id);
                return Err(KEYRING_UNAVAILABLE.into());
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
    let Err(error) = send_to_agent_inner(provider_id, cmd).await else {
        return Ok(());
    };
    crate::log_event!(Level::Warn, "agent.restart", error, "provider" => provider_id);
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

#[expect(
    clippy::too_many_arguments,
    reason = "Tauri maps each field of the invoke payload to an argument"
)]
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
