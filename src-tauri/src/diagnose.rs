use crate::chat::{agent_runner_path, resolve_runtime_layout};
use serde::Serialize;
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DiagnoseStep {
    Ok {
        label: String,
        detail: Option<String>,
    },
    Warn {
        label: String,
        detail: String,
    },
    Fail {
        label: String,
        detail: String,
    },
}

#[derive(Serialize, Clone, Debug)]
pub struct DiagnoseReport {
    pub provider_id: String,
    pub success: bool,
    pub steps: Vec<DiagnoseStep>,
}

fn ok(label: &str, detail: Option<String>) -> DiagnoseStep {
    DiagnoseStep::Ok {
        label: label.to_string(),
        detail,
    }
}

fn fail(label: &str, detail: String) -> DiagnoseStep {
    DiagnoseStep::Fail {
        label: label.to_string(),
        detail,
    }
}

fn warn(label: &str, detail: String) -> DiagnoseStep {
    DiagnoseStep::Warn {
        label: label.to_string(),
        detail,
    }
}

#[tauri::command]
pub async fn chat_diagnose(app: AppHandle, provider_id: String) -> DiagnoseReport {
    let mut steps: Vec<DiagnoseStep> = Vec::new();
    let mut success = true;

    let layout = match resolve_runtime_layout(&app) {
        Ok(l) => {
            steps.push(ok(
                "Resolve runtime directory",
                Some(l.dir.display().to_string()),
            ));
            l
        }
        Err(e) => {
            steps.push(fail("Resolve runtime directory", e));
            return DiagnoseReport {
                provider_id,
                success: false,
                steps,
            };
        }
    };

    if layout.dir.exists() {
        steps.push(ok(
            "Runtime directory exists",
            Some(layout.dir.display().to_string()),
        ));
    } else {
        success = false;
        steps.push(fail(
            "Runtime directory exists",
            format!("Missing: {}", layout.dir.display()),
        ));
    }

    if layout.bun.exists() {
        steps.push(ok(
            "Bun runtime exists",
            Some(layout.bun.display().to_string()),
        ));
    } else if layout.bun.as_os_str() == "bun" {
        steps.push(warn(
            "Bun runtime exists",
            "Using system bun (PATH lookup) — only valid in dev".to_string(),
        ));
    } else {
        success = false;
        steps.push(fail(
            "Bun runtime exists",
            format!("Missing: {}", layout.bun.display()),
        ));
    }

    let runner = agent_runner_path(&layout, &provider_id);
    if runner.exists() {
        steps.push(ok(
            "Agent runner exists",
            Some(runner.display().to_string()),
        ));
    } else {
        success = false;
        steps.push(fail(
            "Agent runner exists",
            format!("Missing: {}", runner.display()),
        ));
    }

    let node_modules = layout.dir.join("node_modules");
    if node_modules.exists() {
        steps.push(ok("node_modules present", None));
    } else {
        success = false;
        steps.push(fail(
            "node_modules present",
            format!("Missing: {}", node_modules.display()),
        ));
    }

    if !success {
        return DiagnoseReport {
            provider_id,
            success,
            steps,
        };
    }

    match try_spawn_status(&layout.bun, &runner, &layout.dir).await {
        Ok(line) => steps.push(ok("Spawn agent + chat_status", Some(line))),
        Err(e) => {
            success = false;
            steps.push(fail("Spawn agent + chat_status", e));
        }
    }

    DiagnoseReport {
        provider_id,
        success,
        steps,
    }
}

async fn try_spawn_status(
    bun: &std::path::Path,
    runner: &std::path::Path,
    cwd: &std::path::Path,
) -> Result<String, String> {
    let mut cmd = Command::new(bun);
    cmd.arg(runner)
        .current_dir(cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn: {e} (bun={}, runner={})",
            bun.display(),
            runner.display()
        )
    })?;

    let mut stdin = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take();

    stdin
        .write_all(b"{\"type\":\"chat_status\"}\n")
        .await
        .map_err(|e| format!("Write failed: {e}"))?;

    let stderr_capture = tokio::spawn(async move {
        let mut out = String::new();
        if let Some(s) = stderr {
            let mut lines = BufReader::new(s).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                out.push_str(&l);
                out.push('\n');
                if out.len() > 4096 {
                    break;
                }
            }
        }
        out
    });

    let read_loop = async {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            let line = lines
                .next_line()
                .await
                .map_err(|e| format!("Read failed: {e}"))?;
            let Some(line) = line else {
                return Err("Agent closed stdout before responding".to_string());
            };
            if line.contains("\"chat_status_result\"") {
                return Ok(line);
            }
        }
    };

    let result = tokio::time::timeout(Duration::from_secs(15), read_loop)
        .await
        .map_err(|_| "Timed out after 15s waiting for status".to_string())?;

    let _ = child.kill().await;
    let stderr_text = stderr_capture.await.unwrap_or_default();

    match result {
        Ok(line) => Ok(line),
        Err(e) => {
            if stderr_text.is_empty() {
                Err(e)
            } else {
                Err(format!("{e}\nstderr:\n{}", stderr_text.trim()))
            }
        }
    }
}
