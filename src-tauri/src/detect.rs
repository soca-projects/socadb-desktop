use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug)]
pub struct FastDetectResult {
    pub installed: bool,
    pub config_dir: Option<String>,
    pub auth_hint: Option<String>,
    pub email: Option<String>,
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn read_json(path: &std::path::Path) -> Option<serde_json::Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn detect_claude_fast() -> FastDetectResult {
    let Some(home) = home_dir() else {
        return FastDetectResult {
            installed: false,
            config_dir: None,
            auth_hint: None,
            email: None,
        };
    };

    let claude_dir = home.join(".claude");
    if !claude_dir.exists() {
        return FastDetectResult {
            installed: false,
            config_dir: None,
            auth_hint: None,
            email: None,
        };
    }

    let credentials = claude_dir.join(".credentials.json");
    let settings = claude_dir.join("settings.json");

    let mut auth_hint: Option<String> = None;
    let mut email: Option<String> = None;

    if credentials.exists() {
        auth_hint = Some("credentials-file".to_string());
        if let Some(json) = read_json(&credentials) {
            if let Some(e) = json
                .get("claudeAiOauth")
                .and_then(|v| v.get("email"))
                .and_then(|v| v.as_str())
            {
                email = Some(e.to_string());
            }
        }
    }

    if email.is_none() {
        if let Some(json) = read_json(&settings) {
            if let Some(e) = json.get("email").and_then(|v| v.as_str()) {
                email = Some(e.to_string());
            }
        }
    }

    FastDetectResult {
        installed: true,
        config_dir: claude_dir.to_str().map(|s| s.to_string()),
        auth_hint,
        email,
    }
}

pub fn detect_codex_fast() -> FastDetectResult {
    let Some(home) = home_dir() else {
        return FastDetectResult {
            installed: false,
            config_dir: None,
            auth_hint: None,
            email: None,
        };
    };

    let codex_dir = home.join(".codex");
    if !codex_dir.exists() {
        return FastDetectResult {
            installed: false,
            config_dir: None,
            auth_hint: None,
            email: None,
        };
    }

    let auth_file = codex_dir.join("auth.json");
    let mut auth_hint: Option<String> = None;
    let mut email: Option<String> = None;

    if auth_file.exists() {
        auth_hint = Some("auth-file".to_string());
        if let Some(json) = read_json(&auth_file) {
            if let Some(e) = json.get("email").and_then(|v| v.as_str()) {
                email = Some(e.to_string());
            }
        }
    }

    FastDetectResult {
        installed: true,
        config_dir: codex_dir.to_str().map(|s| s.to_string()),
        auth_hint,
        email,
    }
}

#[tauri::command]
pub fn fast_detect_provider(provider_id: String) -> FastDetectResult {
    match provider_id.as_str() {
        "claude" => detect_claude_fast(),
        "codex" => detect_codex_fast(),
        _ => FastDetectResult {
            installed: false,
            config_dir: None,
            auth_hint: None,
            email: None,
        },
    }
}
