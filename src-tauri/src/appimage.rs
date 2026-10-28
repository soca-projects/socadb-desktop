use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;

use log::Level;
use tauri::Manager;

const STALE_TEMP_FILE: Duration = Duration::from_secs(3600);

// An AppImage is mounted under a new /tmp/.mount_* folder at each launch and
// unmounted when SocaDB quits: an AI app given that path could only start the
// server while this launch of SocaDB runs.
pub fn stable_mcp_binary(app: &tauri::AppHandle, bundled: PathBuf) -> PathBuf {
    if !inside_appdir(&bundled, std::env::var_os("APPDIR")) {
        return bundled;
    }
    let copied = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())
        .and_then(|dir| copy_if_changed(&bundled, &dir.join("bin")).map_err(|e| e.to_string()));
    match copied {
        Ok(path) => path,
        Err(e) => {
            crate::log_event!(Level::Warn, "mcp.binary.copy_failed", e);
            bundled
        }
    }
}

// Programs started from another AppImage, such as a terminal in an editor
// shipped as one, inherit its APPIMAGE and APPDIR.
fn inside_appdir(bundled: &Path, appdir: Option<OsString>) -> bool {
    appdir
        .and_then(|dir| PathBuf::from(dir).canonicalize().ok())
        .is_some_and(|dir| bundled.starts_with(dir))
}

fn copy_if_changed(source: &Path, dir: &Path) -> std::io::Result<PathBuf> {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let name = source
        .file_name()
        .ok_or_else(|| std::io::Error::other("no file name"))?;
    let target = dir.join(name);
    let source_meta = fs::metadata(source)?;
    let modified = source_meta.modified()?;
    if let Ok(meta) = fs::metadata(&target) {
        if meta.len() == source_meta.len() && meta.modified().ok() == Some(modified) {
            return Ok(target);
        }
    }
    fs::create_dir_all(dir)?;
    remove_stale_temp_files(dir, &name.to_string_lossy());
    let tmp = dir.join(format!(
        ".{}.{}-{}.tmp",
        name.to_string_lossy(),
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let copied = fs::copy(source, &tmp)
        .and_then(|_| fs::File::options().write(true).open(&tmp))
        .and_then(|file| file.set_modified(modified))
        .and_then(|()| fs::rename(&tmp, &target));
    if copied.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    copied.map(|()| target)
}

fn remove_stale_temp_files(dir: &Path, name: &str) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let prefix = format!(".{name}.");
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let stale = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| modified.elapsed().ok())
            .is_some_and(|age| age > STALE_TEMP_FILE);
        if stale && file_name.starts_with(&prefix) && file_name.ends_with(".tmp") {
            let _ = fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("socadb-appimage-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copies_the_binary_when_missing() {
        let dir = temp_dir("missing");
        let source = dir.join("socadb-mcp-linux-x64");
        fs::write(&source, "server v1").unwrap();
        let target = copy_if_changed(&source, &dir.join("bin")).unwrap();
        assert_eq!(target, dir.join("bin/socadb-mcp-linux-x64"));
        assert_eq!(fs::read_to_string(&target).unwrap(), "server v1");
        assert_eq!(
            fs::metadata(&target).unwrap().modified().unwrap(),
            fs::metadata(&source).unwrap().modified().unwrap()
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keeps_a_copy_of_the_same_build() {
        let dir = temp_dir("same");
        let source = dir.join("socadb-mcp-linux-x64");
        fs::write(&source, "server v1").unwrap();
        let target = copy_if_changed(&source, &dir.join("bin")).unwrap();
        let modified = fs::metadata(&target).unwrap().modified().unwrap();
        fs::write(&target, "untouched").unwrap();
        fs::File::options()
            .write(true)
            .open(&target)
            .unwrap()
            .set_modified(modified)
            .unwrap();
        copy_if_changed(&source, &dir.join("bin")).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "untouched");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn replaces_the_copy_of_another_build() {
        let dir = temp_dir("other");
        let source = dir.join("socadb-mcp-linux-x64");
        fs::write(&source, "server v1").unwrap();
        let target = copy_if_changed(&source, &dir.join("bin")).unwrap();
        fs::write(&source, "server v2, longer").unwrap();
        copy_if_changed(&source, &dir.join("bin")).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "server v2, longer");
        assert_eq!(
            fs::read_dir(dir.join("bin")).unwrap().count(),
            1,
            "a temporary file was left behind"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn copies_only_out_of_the_running_appimage() {
        let dir = temp_dir("appdir");
        let mount = dir.join("mount");
        fs::create_dir_all(mount.join("usr/libexec/SocaDB")).unwrap();
        let mount = mount.canonicalize().unwrap();
        let bundled = mount.join("usr/libexec/SocaDB/socadb-mcp-linux-x64");
        assert!(inside_appdir(&bundled, Some(mount.clone().into())));
        assert!(!inside_appdir(
            Path::new("/usr/lib/SocaDB/socadb-mcp-linux-x64"),
            Some(mount.into())
        ));
        assert!(!inside_appdir(&bundled, Some(dir.join("gone").into())));
        assert!(!inside_appdir(&bundled, None));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn removes_temp_files_left_by_an_interrupted_copy() {
        let dir = temp_dir("leftover");
        let bin = dir.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let stale = bin.join(".socadb-mcp-linux-x64.123-0.tmp");
        let running = bin.join(".socadb-mcp-linux-x64.456-0.tmp");
        fs::write(&stale, "partial").unwrap();
        fs::write(&running, "partial").unwrap();
        fs::File::options()
            .write(true)
            .open(&stale)
            .unwrap()
            .set_modified(std::time::SystemTime::now() - 2 * STALE_TEMP_FILE)
            .unwrap();
        let source = dir.join("socadb-mcp-linux-x64");
        fs::write(&source, "server").unwrap();
        copy_if_changed(&source, &bin).unwrap();
        assert!(!stale.exists());
        assert!(running.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_copy_executable() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("mode");
        let source = dir.join("socadb-mcp-linux-x64");
        fs::write(&source, "server").unwrap();
        fs::set_permissions(&source, fs::Permissions::from_mode(0o755)).unwrap();
        let target = copy_if_changed(&source, &dir.join("bin")).unwrap();
        assert_eq!(
            fs::metadata(target).unwrap().permissions().mode() & 0o777,
            0o755
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
