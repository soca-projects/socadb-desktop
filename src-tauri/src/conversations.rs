use std::path::{Path, PathBuf};

fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "No home directory".to_string())
}

fn conversations_dir() -> Result<PathBuf, String> {
    Ok(home()?.join(".socadb").join("conversations"))
}

fn claude_sessions_dir() -> Result<PathBuf, String> {
    Ok(home()?.join(".socadb").join("sessions").join("claude"))
}

// Ids become file names, so this is the guard against path escapes.
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn is_uuid(id: &str) -> bool {
    id.len() == 36
        && id.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn remove_path(path: &Path) -> Result<(), String> {
    let result = if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    match result {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

// Searches every Claude project directory: the SDK files a session under the cwd
// it ran from, and that cwd has varied.
fn remove_claude_session(session_id: &str) -> Result<(), String> {
    if !is_uuid(session_id) {
        return Err(format!("Invalid session id: {session_id}"));
    }
    remove_path(&claude_sessions_dir()?.join(session_id))?;
    let projects = home()?.join(".claude").join("projects");
    if let Ok(entries) = std::fs::read_dir(&projects) {
        for entry in entries.flatten() {
            let dir = entry.path();
            remove_path(&dir.join(format!("{session_id}.jsonl")))?;
            remove_path(&dir.join(session_id))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn conversation_list() -> Result<Vec<String>, String> {
    let entries = match std::fs::read_dir(conversations_dir()?) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    Ok(entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .filter_map(|path| std::fs::read_to_string(path).ok())
        .collect())
}

#[tauri::command]
pub fn conversation_write(id: String, content: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err(format!("Invalid conversation id: {id}"));
    }
    crate::write_atomic(&conversations_dir()?.join(format!("{id}.json")), &content)
}

#[tauri::command]
pub fn conversation_delete(
    id: String,
    provider: Option<String>,
    session_id: Option<String>,
) -> Result<(), String> {
    if !valid_id(&id) {
        return Err(format!("Invalid conversation id: {id}"));
    }
    remove_path(&conversations_dir()?.join(format!("{id}.json")))?;
    match (provider.as_deref(), session_id.as_deref()) {
        (Some("claude"), Some(session)) => remove_claude_session(session),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn conversation_retire_legacy() -> Result<(), String> {
    let legacy = home()?.join(".socadb").join("conversations.json");
    match std::fs::rename(&legacy, legacy.with_extension("json.migrated")) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

// Only our copies: an orphan can come from a conversation that lost its session id,
// and the SDK transcript is then the last trace of that memory.
#[tauri::command]
pub fn claude_sessions_prune(keep: Vec<String>) -> Result<u32, String> {
    let dir = claude_sessions_dir()?;
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e.to_string()),
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if is_uuid(&name) && !keep.contains(&name) {
            remove_path(&dir.join(&name))?;
            removed += 1;
        }
    }
    Ok(removed)
}
