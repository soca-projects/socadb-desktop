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

fn write_file(path: &Path, content: &str) -> Result<(), String> {
    if !is_schema_path(path) {
        return Err("Only .soca files can be saved".into());
    }
    crate::write_atomic(path, content)
}

// Saving goes through Rust because the fs plugin only writes paths picked in a
// dialog during this launch: a schema reopened from the home or restored at
// startup would be refused.
#[tauri::command(async)]
pub fn write_schema_file(path: String, content: String) -> Result<(), String> {
    write_file(Path::new(&path), &content)
}

#[tauri::command(async)]
pub fn duplicate_schema_file(path: String, copy_label: String) -> Result<String, String> {
    duplicate_file(Path::new(&path), &copy_label).map(|p| p.to_string_lossy().into_owned())
}

fn refuses_files(e: &std::io::Error) -> bool {
    use std::io::ErrorKind;
    matches!(
        e.kind(),
        ErrorKind::PermissionDenied
            | ErrorKind::ReadOnlyFilesystem
            | ErrorKind::StorageFull
            | ErrorKind::QuotaExceeded
    )
}

fn write_reserved(target: &Path, content: &str) -> Result<(), String> {
    let dir = target.parent().ok_or_else(|| "not_found".to_string())?;
    let name = target
        .file_name()
        .ok_or_else(|| "not_found".to_string())?
        .to_string_lossy();
    for n in 0..1000 {
        let tmp = dir.join(format!(".{name}.{n}.tmp"));
        let mut file = match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
        {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) if refuses_files(&e) => return Err("folder_refused".into()),
            Err(e) => return Err(e.to_string()),
        };
        let written = file.write_all(content.as_bytes());
        drop(file);
        let result = written.and_then(|()| std::fs::rename(&tmp, target));
        if let Err(e) = result {
            let _ = std::fs::remove_file(&tmp);
            return Err(if refuses_files(&e) {
                "folder_refused".into()
            } else {
                e.to_string()
            });
        }
        return Ok(());
    }
    Err("exists".into())
}

const IMPORT_EXTENSIONS: [&str; 3] = ["sql", "dbml", "json"];
const MAX_IMPORT_BYTES: u64 = 200 * 1024 * 1024;

fn read_import_within(path: &Path, limit: u64) -> Result<String, String> {
    let target = path.canonicalize().map_err(read_error)?;
    let supported = target
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            IMPORT_EXTENSIONS
                .iter()
                .any(|e| ext.eq_ignore_ascii_case(e))
        });
    if !supported {
        return Err("unsupported".into());
    }
    if std::fs::metadata(&target).map_err(read_error)?.len() > limit {
        return Err("too_large".into());
    }
    let bytes = std::fs::read(&target).map_err(read_error)?;
    let text = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
    Ok(String::from_utf8_lossy(text).into_owned())
}

fn read_import(path: &Path) -> Result<String, String> {
    read_import_within(path, MAX_IMPORT_BYTES)
}

#[tauri::command(async)]
pub fn read_import_file(path: String) -> Result<String, String> {
    read_import(Path::new(&path))
}

fn takes_files(dir: &Path) -> Result<(), String> {
    match std::fs::metadata(dir) {
        Ok(meta) if meta.is_dir() => Ok(()),
        _ => Err("folder_refused".into()),
    }
}

fn probe_folder(dir: &Path) -> Result<(), String> {
    takes_files(dir)?;
    for n in 0..1000 {
        let probe = dir.join(format!(".socadb-write-check-{n}.tmp"));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe)
        {
            Ok(file) => {
                drop(file);
                let _ = std::fs::remove_file(&probe);
                return Ok(());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("folder_refused".into()),
        }
    }
    Err("folder_refused".into())
}

#[tauri::command(async)]
pub fn probe_schema_folder(dir: String) -> Result<(), String> {
    probe_folder(Path::new(&dir))
}

fn create_file(dir: &Path, name: &str, content: &str) -> Result<PathBuf, String> {
    takes_files(dir)?;
    let file_name = file_name_for(name)?;
    let stem = &file_name[..file_name.len() - EXTENSION.len() - 1];
    for n in 1..1000 {
        let target = if n == 1 {
            dir.join(&file_name)
        } else {
            dir.join(format!("{stem} {n}.{EXTENSION}"))
        };
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(file) => drop(file),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) if refuses_files(&e) => return Err("folder_refused".into()),
            Err(_) => return Err("invalid_name".into()),
        }
        if let Err(e) = write_reserved(&target, content) {
            let _ = std::fs::remove_file(&target);
            return Err(e);
        }
        return Ok(target);
    }
    Err("exists".into())
}

#[tauri::command(async)]
pub fn create_schema_file(dir: String, name: String, content: String) -> Result<String, String> {
    create_file(Path::new(&dir), &name, &content).map(|p| p.to_string_lossy().into_owned())
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
    fn create_never_overwrites() {
        let dir = temp_dir("create");
        let taken = dir.join("shop.soca");
        std::fs::write(&taken, "OLD").unwrap();
        let first = create_file(&dir, "shop", "A").unwrap();
        let second = create_file(&dir, "shop.soca", "B").unwrap();
        assert_eq!(first, dir.join("shop 2.soca"));
        assert_eq!(second, dir.join("shop 3.soca"));
        assert_eq!(std::fs::read_to_string(&taken).unwrap(), "OLD");
        assert_eq!(std::fs::read_to_string(&first).unwrap(), "A");
        assert!(!dir.join("shop 2.tmp").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_leaves_other_files_alone() {
        let dir = temp_dir("create-tmp");
        std::fs::write(dir.join("backup.tmp"), "MINE").unwrap();
        create_file(&dir, "backup", "x").unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("backup.tmp")).unwrap(),
            "MINE"
        );
        let mut names: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        assert_eq!(names, ["backup.soca", "backup.tmp"]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_reports_a_name_the_disk_refuses_as_that_file_only() {
        let dir = temp_dir("create-long");
        let long = "x".repeat(300);
        assert_eq!(create_file(&dir, &long, "x").unwrap_err(), "invalid_name");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn import_files_are_read_by_extension_only() {
        let dir = temp_dir("read-import");
        for name in ["a.sql", "b.DBML", "c.json", "d.txt", "e.soca"] {
            std::fs::write(dir.join(name), name).unwrap();
        }
        let read = |name: &str| read_import(&dir.join(name));
        assert_eq!(read("a.sql").unwrap(), "a.sql");
        assert_eq!(read("b.DBML").unwrap(), "b.DBML");
        assert_eq!(read("c.json").unwrap(), "c.json");
        assert_eq!(read("d.txt").unwrap_err(), "unsupported");
        assert_eq!(read("e.soca").unwrap_err(), "unsupported");
        assert_eq!(read("gone.sql").unwrap_err(), "not_found");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn import_files_decode_like_a_browser() {
        let dir = temp_dir("read-decode");
        std::fs::write(dir.join("bom.json"), b"\xEF\xBB\xBF{}").unwrap();
        std::fs::write(
            dir.join("latin1.sql"),
            b"-- caf\xE9\nCREATE TABLE t (id INT);",
        )
        .unwrap();
        assert_eq!(read_import(&dir.join("bom.json")).unwrap(), "{}");
        let sql = read_import(&dir.join("latin1.sql")).unwrap();
        assert!(sql.contains("caf\u{FFFD}") && sql.ends_with("CREATE TABLE t (id INT);"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn import_files_over_the_limit_are_refused() {
        let dir = temp_dir("read-limit");
        std::fs::write(dir.join("big.sql"), "x".repeat(20)).unwrap();
        assert_eq!(
            read_import_within(&dir.join("big.sql"), 10).unwrap_err(),
            "too_large"
        );
        assert_eq!(
            read_import_within(&dir.join("big.sql"), 20).unwrap().len(),
            20
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn import_files_check_the_extension_of_the_link_target() {
        let dir = temp_dir("read-link");
        std::fs::write(dir.join("secret"), "key").unwrap();
        std::os::unix::fs::symlink(dir.join("secret"), dir.join("x.json")).unwrap();
        assert_eq!(read_import(&dir.join("x.json")).unwrap_err(), "unsupported");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn probe_checks_a_folder_takes_files_and_leaves_nothing() {
        let dir = temp_dir("probe");
        probe_folder(&dir).unwrap();
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
        assert_eq!(
            probe_folder(&dir.join("gone")).unwrap_err(),
            "folder_refused"
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn probe_refuses_a_read_only_folder() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("probe-locked");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        // Root ignores permissions, so there is nothing to check there.
        if std::fs::File::create(dir.join("probe")).is_err() {
            assert_eq!(probe_folder(&dir).unwrap_err(), "folder_refused");
        }
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn create_refuses_bad_names_and_missing_folders() {
        let dir = temp_dir("create-bad");
        assert_eq!(create_file(&dir, "a/b", "x").unwrap_err(), "invalid_name");
        assert_eq!(create_file(&dir, "  ", "x").unwrap_err(), "invalid_name");
        assert_eq!(
            create_file(&dir.join("gone"), "a", "x").unwrap_err(),
            "folder_refused"
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn create_reports_a_folder_that_refuses_files() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("create-locked");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        // Root ignores permissions, so there is nothing to check there.
        if std::fs::File::create(dir.join("probe")).is_err() {
            assert_eq!(create_file(&dir, "a", "x").unwrap_err(), "folder_refused");
        }
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
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
    fn save_writes_schema_files_only() {
        let dir = temp_dir("save");
        let schema = dir.join("shop.soca");
        write_file(&schema, "{\"v\":1}").unwrap();
        write_file(&schema, "{\"v\":2}").unwrap();
        assert_eq!(std::fs::read_to_string(&schema).unwrap(), "{\"v\":2}");
        assert!(!dir.join("shop.tmp").exists());
        let other = dir.join("notes.txt");
        assert!(write_file(&other, "x").is_err());
        assert!(!other.exists());
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
