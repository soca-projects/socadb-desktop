use std::path::{Path, PathBuf};

const CONFIG_FILE: &str = "claude_desktop_config.json";

// The Microsoft Store (MSIX) build of Claude keeps the config it creates in a
// folder of its own, and an entry written to %APPDATA%\Claude is then ignored
// without any error. Recent versions use Claude-Data and older ones the package's
// folder, so a file left in the older place must not win. Claude-Data sits outside
// the package and may outlive an uninstall, so it only counts while the package
// is there. A config already in %APPDATA% before the install stays there, so only
// an existing file decides.
fn msix_config_file(local_data: &Path) -> Option<PathBuf> {
    let claude_data = local_data.join("Claude-Data");
    std::fs::read_dir(local_data.join("Packages"))
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name();
            let publisher = name.to_str()?.strip_prefix("Claude_")?.to_owned();
            Some((entry.path(), publisher))
        })
        .flat_map(|(package, publisher)| {
            [
                claude_data
                    .join(format!("claude_{publisher}"))
                    .join(CONFIG_FILE),
                package
                    .join("LocalCache")
                    .join("Roaming")
                    .join("Claude")
                    .join(CONFIG_FILE),
            ]
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

    fn config_in_claude_data(local: &Path, folder: &str) -> PathBuf {
        let dir = local.join("Claude-Data").join(folder);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(CONFIG_FILE), "{}").unwrap();
        dir.join(CONFIG_FILE)
    }

    #[test]
    fn finds_the_config_in_the_claude_data_folder() {
        let local = local_data("claude-data", &["Claude_pzs8sxrjxfjjc"]);
        let file = config_in_claude_data(&local, "claude_pzs8sxrjxfjjc");
        assert_eq!(msix_config_file(&local), Some(file));
        std::fs::remove_dir_all(local).unwrap();
    }

    #[test]
    fn prefers_the_claude_data_folder_over_the_package_folder() {
        let local = local_data("both", &[]);
        config_in(&local, "Claude_pzs8sxrjxfjjc");
        let file = config_in_claude_data(&local, "claude_pzs8sxrjxfjjc");
        assert_eq!(msix_config_file(&local), Some(file));
        std::fs::remove_dir_all(local).unwrap();
    }

    #[test]
    fn ignores_other_folders_in_claude_data() {
        let local = local_data("other", &["Claude_pzs8sxrjxfjjc"]);
        config_in_claude_data(&local, "cache");
        assert_eq!(msix_config_file(&local), None);
        std::fs::remove_dir_all(local).unwrap();
    }

    #[test]
    fn ignores_claude_data_once_its_package_is_gone() {
        let local = local_data("uninstalled", &["Microsoft.Something_8wekyb"]);
        config_in_claude_data(&local, "claude_pzs8sxrjxfjjc");
        assert_eq!(msix_config_file(&local), None);
        std::fs::remove_dir_all(local).unwrap();
    }

    #[test]
    fn ignores_the_claude_data_folder_of_another_publisher() {
        let local = local_data("publisher", &["Claude_pzs8sxrjxfjjc"]);
        config_in_claude_data(&local, "claude_someoneelse");
        assert_eq!(msix_config_file(&local), None);
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
