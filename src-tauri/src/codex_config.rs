use serde::Serialize;
use toml_edit::{value, Array, DocumentMut, Item, Table};

#[derive(Serialize)]
pub struct CodexMcpEntry {
    installed: bool,
    command: Option<String>,
}

fn codex_dir() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".codex"))
        .ok_or_else(|| "No home folder".into())
}

fn read_config(path: &std::path::Path) -> Result<String, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

// TomlError's text quotes the failing line, and Codex configs hold tokens
// (MCP env, bearer headers): keep only where it failed.
fn parse_error(content: &str, error: &toml_edit::TomlError) -> String {
    match error.span() {
        Some(span) => {
            let before = content.get(..span.start).unwrap_or("");
            let line = before.matches('\n').count() + 1;
            let column = before.len() - before.rfind('\n').map_or(0, |i| i + 1) + 1;
            format!("~/.codex/config.toml doesn't parse (line {line}, column {column})")
        }
        None => "~/.codex/config.toml doesn't parse".into(),
    }
}

fn parse(content: &str) -> Result<DocumentMut, String> {
    content
        .parse()
        .map_err(|e: toml_edit::TomlError| parse_error(content, &e))
}

fn socadb_command(content: &str) -> Result<Option<String>, String> {
    let doc = parse(content)?;
    Ok(doc
        .get("mcp_servers")
        .and_then(|servers| servers.get("socadb"))
        .and_then(|entry| entry.get("command"))
        .and_then(Item::as_str)
        .map(str::to_owned))
}

fn with_socadb_server(content: &str, command: Option<&str>) -> Result<String, String> {
    let mut doc = parse(content)?;
    match command {
        Some(command) => {
            let servers = doc
                .entry("mcp_servers")
                .or_insert_with(|| {
                    let mut servers = Table::new();
                    servers.set_implicit(true);
                    Item::Table(servers)
                })
                .as_table_like_mut()
                .ok_or("mcp_servers isn't a table")?;
            if !servers.contains_key("socadb") {
                servers.insert("socadb", Item::Table(Table::new()));
            }
            let entry = servers
                .get_mut("socadb")
                .and_then(Item::as_table_like_mut)
                .ok_or("mcp_servers.socadb isn't a table")?;
            entry.insert("command", value(command));
            if !entry.contains_key("args") {
                entry.insert("args", value(Array::new()));
            }
        }
        None => {
            if let Some(servers) = doc.get_mut("mcp_servers").and_then(Item::as_table_like_mut) {
                servers.remove("socadb");
            }
        }
    }
    Ok(doc.to_string())
}

#[tauri::command]
pub fn codex_mcp_entry() -> Result<CodexMcpEntry, String> {
    let dir = codex_dir()?;
    if !dir.is_dir() {
        return Ok(CodexMcpEntry {
            installed: false,
            command: None,
        });
    }
    let command = socadb_command(&read_config(&dir.join("config.toml"))?)?;
    Ok(CodexMcpEntry {
        installed: true,
        command,
    })
}

#[tauri::command]
pub fn codex_mcp_set(command: Option<String>) -> Result<(), String> {
    let dir = codex_dir()?;
    if !dir.is_dir() {
        return Err("Codex isn't installed".into());
    }
    let path = dir.join("config.toml");
    let updated = with_socadb_server(&read_config(&path)?, command.as_deref())?;
    crate::write_atomic(&path, &updated)
}

#[cfg(test)]
mod tests {
    use super::*;

    const OURS: &str = "/Applications/SocaDB.app/Contents/Resources/socadb-mcp-darwin-arm64";

    #[test]
    fn parse_errors_never_quote_the_config() {
        let config =
            "[mcp_servers.github.env]\nGITHUB_TOKEN = ghp_abcdefghijklmnopqrstuvwxyz012345\n";
        let error = socadb_command(config).unwrap_err();
        assert!(!error.contains("ghp_"), "{error}");
        assert!(error.contains("line 2"), "{error}");
        assert!(with_socadb_server(config, Some(OURS))
            .unwrap_err()
            .contains("line 2"));
    }

    #[test]
    fn adds_the_server_to_an_empty_config() {
        let updated = with_socadb_server("", Some(OURS)).unwrap();
        assert_eq!(
            updated,
            format!("[mcp_servers.socadb]\ncommand = \"{OURS}\"\nargs = []\n")
        );
        assert_eq!(socadb_command(&updated).unwrap().as_deref(), Some(OURS));
    }

    #[test]
    fn keeps_comments_settings_and_other_servers() {
        let config = "# my settings\nmodel = \"gpt-6-sol\"\n\n[mcp_servers.other]\ncommand = \"other\" # keep\n";
        let updated = with_socadb_server(config, Some(OURS)).unwrap();
        assert!(updated.starts_with(config));
        assert!(updated.ends_with(&format!(
            "[mcp_servers.socadb]\ncommand = \"{OURS}\"\nargs = []\n"
        )));
    }

    #[test]
    fn repoints_an_existing_entry_and_keeps_its_other_keys() {
        let config = "[mcp_servers.socadb]\ncommand = \"/Volumes/SocaDB/x\"\nargs = [\"-v\"]\nenv = { A = \"1\" }\n";
        let updated = with_socadb_server(config, Some(OURS)).unwrap();
        assert_eq!(
            updated,
            format!(
                "[mcp_servers.socadb]\ncommand = \"{OURS}\"\nargs = [\"-v\"]\nenv = {{ A = \"1\" }}\n"
            )
        );
    }

    #[test]
    fn updates_an_inline_entry() {
        let config = "[mcp_servers]\nsocadb = { command = \"/old\" }\n";
        let updated = with_socadb_server(config, Some(OURS)).unwrap();
        assert_eq!(socadb_command(&updated).unwrap().as_deref(), Some(OURS));
    }

    #[test]
    fn removes_only_the_socadb_server() {
        let config = format!(
            "[mcp_servers.other]\ncommand = \"other\"\n\n[mcp_servers.socadb]\ncommand = \"{OURS}\"\nargs = []\n"
        );
        let updated = with_socadb_server(&config, None).unwrap();
        assert_eq!(updated, "[mcp_servers.other]\ncommand = \"other\"\n");
        assert_eq!(socadb_command(&updated).unwrap(), None);
    }

    #[test]
    fn refuses_a_config_it_cannot_parse() {
        assert!(with_socadb_server("model = ", Some(OURS)).is_err());
        assert!(socadb_command("[mcp_servers").is_err());
    }
}
