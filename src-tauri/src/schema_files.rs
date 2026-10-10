use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};

const EXTENSION: &str = "soca";

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileState {
    Present,
    Missing,
    Unavailable,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaFileInfo {
    path: String,
    state: FileState,
    modified_ms: Option<u64>,
}

fn is_schema_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case(EXTENSION))
}

fn file_info(path: &str) -> SchemaFileInfo {
    let p = Path::new(path);
    let (state, modified_ms) = match std::fs::metadata(p) {
        Ok(meta) if meta.is_file() && is_schema_path(p) => (
            FileState::Present,
            meta.modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|age| age.as_millis() as u64),
        ),
        // The home offers to forget missing files: a refused access (macOS
        // privacy prompt denied, permissions) must not pass for a deleted file.
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => (FileState::Unavailable, None),
        _ => (FileState::Missing, None),
    };
    SchemaFileInfo {
        path: path.to_owned(),
        state,
        modified_ms,
    }
}

pub(crate) fn read_error(e: std::io::Error) -> String {
    match e.kind() {
        std::io::ErrorKind::NotFound => "not_found".into(),
        std::io::ErrorKind::PermissionDenied => "permission_denied".into(),
        _ => format!("Failed to read file: {e}"),
    }
}

#[tauri::command(async)]
pub fn schema_files_info(paths: Vec<String>) -> Vec<SchemaFileInfo> {
    paths.iter().map(|path| file_info(path)).collect()
}

fn file_name_for(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    let stem = if trimmed.to_ascii_lowercase().ends_with(".soca") {
        &trimmed[..trimmed.len() - 5]
    } else {
        trimmed
    }
    .trim();
    if stem.is_empty() || stem.starts_with('.') || stem.contains(['/', '\\', ':']) {
        return Err("invalid_name".into());
    }
    Ok(format!("{stem}.{EXTENSION}"))
}

fn same_file(a: &Path, b: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        match (std::fs::metadata(a), std::fs::metadata(b)) {
            (Ok(x), Ok(y)) => x.dev() == y.dev() && x.ino() == y.ino(),
            _ => false,
        }
    }
    #[cfg(not(unix))]
    {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    }
}

fn existing_schema(path: &Path) -> Result<&Path, String> {
    if !is_schema_path(path) || !path.is_file() {
        return Err("not_found".into());
    }
    path.parent().ok_or_else(|| "not_found".to_string())
}

fn rename_file(path: &Path, new_name: &str) -> Result<PathBuf, String> {
    let dir = existing_schema(path)?;
    let target = dir.join(file_name_for(new_name)?);
    // A case-only rename on a case-insensitive disk targets the same file.
    if target.exists() && !same_file(path, &target) {
        return Err("exists".into());
    }
    std::fs::rename(path, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

#[tauri::command(async)]
pub fn rename_schema_file(path: String, new_name: String) -> Result<String, String> {
    rename_file(Path::new(&path), &new_name).map(|p| p.to_string_lossy().into_owned())
}

fn duplicate_file(path: &Path, label: &str) -> Result<PathBuf, String> {
    let dir = existing_schema(path)?;
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "not_found".to_string())?;
    let label = label.trim();
    let label = if label.is_empty() || label.contains(['/', '\\', ':']) {
        "copy"
    } else {
        label
    };
    let content = std::fs::read(path).map_err(|e| e.to_string())?;
    for n in 1..1000 {
        let name = if n == 1 {
            format!("{stem} {label}.{EXTENSION}")
        } else {
            format!("{stem} {label} {n}.{EXTENSION}")
        };
        let target = dir.join(name);
        let mut file = match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        };
        if let Err(e) = file.write_all(&content) {
            drop(file);
            let _ = std::fs::remove_file(&target);
            return Err(e.to_string());
        }
        return Ok(target);
    }
    Err("exists".into())
}

#[tauri::command(async)]
pub fn duplicate_schema_file(path: String, copy_label: String) -> Result<String, String> {
    duplicate_file(Path::new(&path), &copy_label).map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("socadb-schema-files-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn path_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn info_reports_existing_schemas_only() {
        let dir = temp_dir("info");
        let schema = dir.join("a.soca");
        std::fs::write(&schema, "{}").unwrap();
        let other = dir.join("notes.txt");
        std::fs::write(&other, "x").unwrap();
        let infos = schema_files_info(vec![
            path_string(&schema),
            path_string(&dir.join("gone.soca")),
            path_string(&other),
        ]);
        assert_eq!(infos[0].state, FileState::Present);
        assert!(infos[0].modified_ms.is_some());
        assert_eq!(infos[1].state, FileState::Missing);
        assert!(infos[1].modified_ms.is_none());
        assert_eq!(infos[2].state, FileState::Missing);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refused_access_is_not_missing() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("locked");
        let locked = dir.join("locked");
        std::fs::create_dir(&locked).unwrap();
        let schema = locked.join("a.soca");
        std::fs::write(&schema, "{}").unwrap();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();
        // Root ignores permissions, so there is nothing to check there.
        if std::fs::metadata(&schema).is_err() {
            let infos = schema_files_info(vec![path_string(&schema)]);
            assert_eq!(infos[0].state, FileState::Unavailable);
        }
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_errors_are_codes_for_the_app() {
        use std::io::{Error, ErrorKind};
        assert_eq!(read_error(Error::from(ErrorKind::NotFound)), "not_found");
        assert_eq!(
            read_error(Error::from(ErrorKind::PermissionDenied)),
            "permission_denied"
        );
        assert!(read_error(Error::from(ErrorKind::InvalidData)).starts_with("Failed to read file"));
    }

    #[test]
    fn file_names_are_checked() {
        assert_eq!(file_name_for(" shop ").unwrap(), "shop.soca");
        assert_eq!(file_name_for("shop.SOCA").unwrap(), "shop.soca");
        for bad in ["", "  ", ".hidden", "a/b", "a\\b", "a:b", ".soca"] {
            assert!(file_name_for(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn rename_refuses_to_overwrite() {
        let dir = temp_dir("rename");
        let a = dir.join("a.soca");
        let b = dir.join("b.soca");
        std::fs::write(&a, "A").unwrap();
        std::fs::write(&b, "B").unwrap();
        assert_eq!(rename_file(&a, "b").unwrap_err(), "exists");
        assert_eq!(std::fs::read_to_string(&b).unwrap(), "B");
        let renamed = rename_file(&a, "c").unwrap();
        assert_eq!(renamed, dir.join("c.soca"));
        assert!(!a.exists());
        assert_eq!(std::fs::read_to_string(&renamed).unwrap(), "A");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rename_can_change_only_the_case() {
        let dir = temp_dir("case");
        let a = dir.join("shop.soca");
        std::fs::write(&a, "A").unwrap();
        let renamed = rename_file(&a, "Shop").unwrap();
        assert_eq!(renamed, dir.join("Shop.soca"));
        assert_eq!(std::fs::read_to_string(&renamed).unwrap(), "A");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn duplicate_picks_a_free_name() {
        let dir = temp_dir("dup");
        let a = dir.join("shop.soca");
        std::fs::write(&a, "A").unwrap();
        let first = duplicate_file(&a, "copie").unwrap();
        let second = duplicate_file(&a, "copie").unwrap();
        assert_eq!(first, dir.join("shop copie.soca"));
        assert_eq!(second, dir.join("shop copie 2.soca"));
        assert_eq!(std::fs::read_to_string(&second).unwrap(), "A");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_schema_files_are_touched() {
        let dir = temp_dir("ext");
        let txt = dir.join("notes.txt");
        std::fs::write(&txt, "x").unwrap();
        assert!(rename_file(&txt, "y").is_err());
        assert!(duplicate_file(&txt, "copy").is_err());
        assert!(txt.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
