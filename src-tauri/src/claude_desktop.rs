use std::path::{Path, PathBuf};

const CONFIG_FILE: &str = "claude_desktop_config.json";

// The Microsoft Store (MSIX) build of Claude keeps the config it creates in its
// package's own folder, and an entry written to %APPDATA%\Claude is then ignored
// without any error. A config already in %APPDATA% before the install stays
// there, so only an existing file decides.
fn msix_config_file(local_data: &Path) -> Option<PathBuf> {
    std::fs::read_dir(local_data.join("Packages"))
        .ok()?
        .flatten()
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("Claude_"))
        .map(|entry| {
            entry
                .path()
                .join("LocalCache")
                .join("Roaming")
                .join("Claude")
                .join(CONFIG_FILE)
        })
        .find(|file| file.is_file())
}

#[tauri::command]
pub fn claude_desktop_config_path() -> Result<String, String> {
    let msix = if cfg!(windows) {
        dirs::data_local_dir().and_then(|dir| msix_config_file(&dir))
    } else {
        None
    };
    let file = msix
        .or_else(|| dirs::data_dir().map(|dir| dir.join("Claude").join(CONFIG_FILE)))
        .ok_or("No data folder")?;
    file.to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Path is not valid UTF-8".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local_data(name: &str, packages: &[&str]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("socadb-claude-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for package in packages {
            std::fs::create_dir_all(dir.join("Packages").join(package)).unwrap();
        }
        dir
    }

    fn config_in(local: &Path, package: &str) -> PathBuf {
        let dir = local
            .join("Packages")
            .join(package)
            .join("LocalCache/Roaming/Claude");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(CONFIG_FILE), "{}").unwrap();
        dir.join(CONFIG_FILE)
    }

    #[test]
    fn finds_the_config_in_the_msix_package_folder() {
        let local = local_data("msix", &["Microsoft.Something_8wekyb"]);
        let file = config_in(&local, "Claude_pzs8sxrjxfjjc");
        assert_eq!(msix_config_file(&local), Some(file));
        std::fs::remove_dir_all(local).unwrap();
    }

    #[test]
    fn ignores_a_package_folder_without_a_config() {
        let local = local_data("empty", &["Claude_pzs8sxrjxfjjc"]);
        assert_eq!(msix_config_file(&local), None);
        assert_eq!(msix_config_file(&local.join("missing")), None);
        std::fs::remove_dir_all(local).unwrap();
    }
}
