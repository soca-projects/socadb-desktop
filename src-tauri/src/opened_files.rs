use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::log_event;

const BATCH_WINDOW: Duration = Duration::from_millis(400);
#[cfg(any(not(target_os = "macos"), test))]
const RELAUNCH_WINDOW: Duration = Duration::from_secs(600);

#[derive(Default)]
pub struct OpenedFiles(Mutex<Inbox>);

impl OpenedFiles {
    fn inbox(&self) -> MutexGuard<'_, Inbox> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[derive(Default)]
struct Inbox {
    ready: bool,
    queued: Vec<String>,
    generation: u64,
}

impl Inbox {
    fn receive(&mut self, paths: Vec<String>) -> Option<u64> {
        self.queued.extend(paths);
        if !self.ready {
            return None;
        }
        self.generation += 1;
        Some(self.generation)
    }

    fn flush(&mut self, generation: u64) -> Option<Vec<String>> {
        if generation != self.generation || self.queued.is_empty() {
            return None;
        }
        Some(std::mem::take(&mut self.queued))
    }

    fn take(&mut self) -> Vec<String> {
        self.ready = true;
        std::mem::take(&mut self.queued)
    }
}

pub fn soca_paths<I, P>(args: I, cwd: &Path) -> Vec<String>
where
    I: IntoIterator<Item = P>,
    P: Into<PathBuf>,
{
    args.into_iter()
        .map(Into::into)
        .filter(|path: &PathBuf| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("soca"))
        })
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        })
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

// The webview may not listen yet (a file opened at launch): the paths wait until
// it asks for them with `take_opened_files`. On macOS such a file arrives before
// setup, so before the logger: it is logged when handed over. Windows Explorer
// starts one SocaDB per selected file, so files arriving close together go out
// as one batch.
pub fn deliver<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    focus_main(app);
    let Some(state) = app.try_state::<OpenedFiles>() else {
        return;
    };
    let Some(generation) = state.inbox().receive(paths) else {
        return;
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(BATCH_WINDOW).await;
        let Some(state) = app.try_state::<OpenedFiles>() else {
            return;
        };
        let Some(paths) = state.inbox().flush(generation) else {
            return;
        };
        log_handover(paths.len());
        if let Err(e) = app.emit("files-opened", paths) {
            log_event!(log::Level::Warn, "file.opened.emit_failed", e);
        }
    });
}

#[cfg(not(target_os = "macos"))]
pub fn from_second_instance<R: Runtime>(app: &AppHandle<R>, args: Vec<String>, cwd: String) {
    let paths = soca_paths(args.into_iter().skip(1), Path::new(&cwd));
    if paths.is_empty() {
        focus_main(app);
    }
    deliver(app, paths);
}

fn log_handover(count: usize) {
    log_event!(log::Level::Info, "file.opened", "Files opened from the system", "count" => count);
}

fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    for result in [window.unminimize(), window.show(), window.set_focus()] {
        if let Err(e) = result {
            log_event!(log::Level::Warn, "window.focus.failed", e);
        }
    }
}

#[tauri::command]
pub fn take_opened_files(state: tauri::State<'_, OpenedFiles>) -> Vec<String> {
    let paths = state.inbox().take();
    if !paths.is_empty() {
        log_handover(paths.len());
    }
    paths
}

fn launch_files() -> Vec<String> {
    let cwd = std::env::current_dir().unwrap_or_default();
    soca_paths(std::env::args_os().skip(1), &cwd)
}

fn relaunch_marker() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".socadb").join(".relaunch"))
}

// The updater restarts SocaDB with the arguments of its first launch: without
// this note, a file double-clicked then would open again after every update.
#[tauri::command]
pub fn mark_relaunch() -> Result<(), String> {
    let marker = relaunch_marker().ok_or("No home directory")?;
    write_marker(&marker, &launch_files())
}

#[tauri::command]
pub fn clear_relaunch() {
    if let Some(marker) = relaunch_marker() {
        remove_marker(&marker);
    }
}

fn write_marker(marker: &Path, files: &[String]) -> Result<(), String> {
    if files.is_empty() {
        remove_marker(marker);
        return Ok(());
    }
    if let Some(dir) = marker.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string(files).map_err(|e| e.to_string())?;
    std::fs::write(marker, content).map_err(|e| e.to_string())
}

fn remove_marker(marker: &Path) {
    if let Err(e) = std::fs::remove_file(marker) {
        if e.kind() != std::io::ErrorKind::NotFound {
            log_event!(log::Level::Warn, "file.opened.relaunch_marker_failed", e);
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn files_to_open_at_launch() -> Vec<String> {
    let files = launch_files();
    let Some(marker) = relaunch_marker() else {
        return files;
    };
    if replayed(&marker, &files, RELAUNCH_WINDOW) {
        log_event!(log::Level::Info, "file.opened.skipped_after_update", "Launch files already opened before the update", "count" => files.len());
        return Vec::new();
    }
    files
}

#[cfg(any(not(target_os = "macos"), test))]
fn replayed(marker: &Path, files: &[String], window: Duration) -> bool {
    let fresh = std::fs::metadata(marker)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_some_and(|age| age < window);
    let noted: Option<Vec<String>> = std::fs::read_to_string(marker)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok());
    remove_marker(marker);
    fresh && !files.is_empty() && noted.as_deref() == Some(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("socadb-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn holds_paths_until_the_webview_asks() {
        let mut inbox = Inbox::default();
        assert_eq!(inbox.receive(vec!["a.soca".into()]), None);
        assert_eq!(inbox.receive(vec!["b.soca".into()]), None);
        assert_eq!(
            inbox.take(),
            vec!["a.soca".to_string(), "b.soca".to_string()]
        );
        assert!(inbox.take().is_empty());
    }

    #[test]
    fn sends_files_arriving_close_together_as_one_batch() {
        let mut inbox = Inbox::default();
        inbox.take();
        let first = inbox.receive(vec!["a.soca".into()]).unwrap();
        let second = inbox.receive(vec!["b.soca".into()]).unwrap();
        assert_eq!(inbox.flush(first), None);
        assert_eq!(
            inbox.flush(second),
            Some(vec!["a.soca".to_string(), "b.soca".to_string()])
        );
        assert_eq!(inbox.flush(second), None);
    }

    #[test]
    fn keeps_only_existing_soca_files_and_resolves_them_from_the_cwd() {
        let dir = temp_dir("opened");
        std::fs::write(dir.join("shop.soca"), "{}").unwrap();
        std::fs::write(dir.join("BLOG.SOCA"), "{}").unwrap();
        std::fs::write(dir.join("notes.sql"), "").unwrap();

        let found = soca_paths(
            [
                "shop.soca".to_string(),
                dir.join("BLOG.SOCA").to_string_lossy().into_owned(),
                "notes.sql".to_string(),
                "missing.soca".to_string(),
                "--flag".to_string(),
            ],
            &dir,
        );
        assert_eq!(
            found,
            vec![
                dir.join("shop.soca").to_string_lossy().into_owned(),
                dir.join("BLOG.SOCA").to_string_lossy().into_owned(),
            ]
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn skips_launch_files_only_when_the_note_lists_the_same_ones_and_is_fresh() {
        let dir = temp_dir("relaunch");
        let marker = dir.join(".relaunch");
        let shop = vec!["/a/shop.soca".to_string()];
        let blog = vec!["/a/blog.soca".to_string()];
        assert!(!replayed(&marker, &shop, RELAUNCH_WINDOW));

        write_marker(&marker, &shop).unwrap();
        assert!(replayed(&marker, &shop, RELAUNCH_WINDOW));
        assert!(!marker.exists());
        assert!(!replayed(&marker, &shop, RELAUNCH_WINDOW));

        write_marker(&marker, &shop).unwrap();
        assert!(!replayed(&marker, &blog, RELAUNCH_WINDOW));
        assert!(!marker.exists());

        write_marker(&marker, &shop).unwrap();
        std::fs::File::options()
            .write(true)
            .open(&marker)
            .unwrap()
            .set_modified(std::time::SystemTime::now() - Duration::from_secs(3600))
            .unwrap();
        assert!(!replayed(&marker, &shop, RELAUNCH_WINDOW));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn notes_nothing_for_a_launch_without_files_and_clears_an_old_note() {
        let dir = temp_dir("relaunch-empty");
        let marker = dir.join(".relaunch");
        write_marker(&marker, &["/a/shop.soca".to_string()]).unwrap();
        write_marker(&marker, &[]).unwrap();
        assert!(!marker.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
