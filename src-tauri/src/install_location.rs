use std::ffi::{c_void, CStr, CString};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime};

use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSAlert, NSAlertFirstButtonReturn, NSApplication, NSApplicationActivationPolicy,
    NSRunningApplication,
};
use objc2_foundation::{NSFileManager, NSLocale, NSString, NSURL};

const QUARANTINE: &CStr = c"com.apple.quarantine";
const REPAIR_MARKER: &str = "socadb-quarantine-repair";
const REPAIR_RETRY_WINDOW: Duration = Duration::from_secs(60);

// `open` brings a running instance forward instead of starting the copy, and the
// disk image only detaches once nothing runs from it. Paths stay positional
// arguments, never spliced into the script.
const RELAUNCH_SCRIPT: &str = r#"while /bin/kill -0 "$1" 2>/dev/null; do /bin/sleep 0.2; done
/usr/bin/open "$2"
if [ -n "$3" ]; then /bin/sleep 3; /usr/bin/hdiutil detach "$3" >/dev/null 2>&1; fi"#;

#[derive(Debug, PartialEq)]
enum Launch {
    Installed,
    Repair(PathBuf),
    Install(PathBuf),
}

#[derive(Debug, PartialEq)]
enum Existing {
    Open,
    Replace,
}

struct Texts {
    title: &'static str,
    body: &'static str,
    install: &'static str,
    quit: &'static str,
    failed: &'static str,
    manual_install: &'static str,
    manual_repair: &'static str,
    still_translocated: &'static str,
    not_ours: &'static str,
}

const EN: Texts = Texts {
    title: "Install SocaDB in Applications",
    body: "SocaDB is running from the disk image. Install it to use it and receive updates.",
    install: "Install in Applications",
    quit: "Quit",
    failed: "SocaDB couldn't be installed",
    manual_install: "Drag SocaDB onto the Applications folder in the disk image window, then open it from Applications.",
    manual_repair: "In the Finder, drag SocaDB out of its folder and back, then open it again.",
    still_translocated: "macOS still runs SocaDB from a temporary location.",
    not_ours: "Another item named SocaDB is already in the Applications folder.",
};

const FR: Texts = Texts {
    title: "Installer SocaDB dans Applications",
    body: "SocaDB est ouverte depuis l'image disque. Installez-la pour l'utiliser et recevoir les mises à jour.",
    install: "Installer dans Applications",
    quit: "Quitter",
    failed: "Impossible d'installer SocaDB",
    manual_install: "Glissez SocaDB sur le dossier Applications dans la fenêtre de l'image disque, puis ouvrez-la depuis Applications.",
    manual_repair: "Dans le Finder, glissez SocaDB hors de son dossier puis remettez-la, et rouvrez-la.",
    still_translocated: "macOS lance toujours SocaDB depuis un emplacement temporaire.",
    not_ours: "Un autre élément nommé SocaDB se trouve déjà dans le dossier Applications.",
};

/// Exits the process when this copy can't receive updates: Sparkle refuses a
/// bundle on a read-only volume (the disk image) or translocated by Gatekeeper.
/// Runs before Tauri starts, so such a copy never registers its MCP path in the
/// AI clients' configs nor starts the updater.
pub fn ensure_installed() {
    let Some(bundle) = current_bundle() else {
        return;
    };
    let launch = classify(&bundle, is_read_only, translocated_original);
    if launch == Launch::Installed {
        return;
    }
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let texts = if prefers_french() { &FR } else { &EN };

    let result = match launch {
        Launch::Installed => return,
        Launch::Repair(original) => repair(&original, texts),
        Launch::Install(source) => {
            if !ask_to_install(mtm, texts) {
                std::process::exit(0);
            }
            install(&source, texts).map_err(|error| format!("{error}\n\n{}", texts.manual_install))
        }
    };
    if let Err(message) = result {
        show_error(mtm, texts, &message);
        std::process::exit(1);
    }
    std::process::exit(0);
}

fn classify(
    bundle: &Path,
    read_only: impl Fn(&Path) -> bool,
    original: impl FnOnce(&Path) -> Option<PathBuf>,
) -> Launch {
    let translocated = bundle.to_string_lossy().contains("/AppTranslocation/");
    if !translocated {
        return if read_only(bundle) {
            Launch::Install(bundle.to_path_buf())
        } else {
            Launch::Installed
        };
    }
    // A copy moved without the Finder (Terminal, several items dragged at once)
    // keeps the quarantine flag that translocates it on every launch, even from
    // the Applications folder.
    match original(bundle) {
        Some(path) if !read_only(&path) => Launch::Repair(path),
        Some(path) => Launch::Install(path),
        None => Launch::Install(bundle.to_path_buf()),
    }
}

fn existing_action(
    installed: Option<&semver::Version>,
    ours: Option<&semver::Version>,
    running: bool,
) -> Existing {
    match (installed, ours) {
        (Some(installed), Some(ours)) if !running && installed < ours => Existing::Replace,
        _ => Existing::Open,
    }
}

fn current_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.parent()?.parent()?.parent()?;
    (bundle.extension()? == "app").then(|| bundle.to_path_buf())
}

fn c_path(path: &Path) -> Option<CString> {
    CString::new(path.as_os_str().as_bytes()).ok()
}

fn mount_of(path: &Path) -> Option<libc::statfs> {
    let path = c_path(path)?;
    let mut info: libc::statfs = unsafe { std::mem::zeroed() };
    (unsafe { libc::statfs(path.as_ptr(), &mut info) } == 0).then_some(info)
}

fn is_read_only(path: &Path) -> bool {
    mount_of(path).is_some_and(|info| info.f_flags & libc::MNT_RDONLY as u32 != 0)
}

fn is_writable(path: &Path) -> bool {
    c_path(path).is_some_and(|path| unsafe { libc::access(path.as_ptr(), libc::W_OK) } == 0)
}

// Apple's only way to find where a translocated app really lives is this
// undocumented Security function, looked up at runtime so a macOS without it
// still launches.
fn translocated_original(bundle: &Path) -> Option<PathBuf> {
    type CreateOriginalPath = unsafe extern "C" fn(*const c_void, *mut c_void) -> *mut c_void;
    let symbol = unsafe {
        libc::dlsym(
            libc::RTLD_DEFAULT,
            c"SecTranslocateCreateOriginalPathForURL".as_ptr(),
        )
    };
    if symbol.is_null() {
        return None;
    }
    let create: CreateOriginalPath = unsafe { std::mem::transmute(symbol) };
    let url = NSURL::fileURLWithPath(&NSString::from_str(bundle.to_str()?));
    let original = unsafe { create(Retained::as_ptr(&url).cast(), std::ptr::null_mut()) };
    let original = unsafe { Retained::from_raw(original.cast::<NSURL>()) }?;
    Some(PathBuf::from(original.path()?.to_string()))
}

fn prefers_french() -> bool {
    let configured = dirs::home_dir()
        .and_then(|home| std::fs::read_to_string(home.join(".socadb/config.json")).ok())
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|config| config.get("language")?.as_str().map(str::to_owned));
    match configured {
        Some(language) => language == "fr",
        None => NSLocale::preferredLanguages()
            .firstObject()
            .is_some_and(|language| language.to_string().starts_with("fr")),
    }
}

fn front_app(mtm: MainThreadMarker) {
    let app = NSApplication::sharedApplication(mtm);
    app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
    // Its replacement, activate(), only exists from macOS 14.
    #[allow(deprecated)]
    app.activateIgnoringOtherApps(true);
}

fn ask_to_install(mtm: MainThreadMarker, texts: &Texts) -> bool {
    front_app(mtm);
    let alert = NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(texts.title));
    alert.setInformativeText(&NSString::from_str(texts.body));
    alert.addButtonWithTitle(&NSString::from_str(texts.install));
    alert.addButtonWithTitle(&NSString::from_str(texts.quit));
    alert.runModal() == NSAlertFirstButtonReturn
}

fn show_error(mtm: MainThreadMarker, texts: &Texts, message: &str) {
    front_app(mtm);
    let alert = NSAlert::new(mtm);
    alert.setMessageText(&NSString::from_str(texts.failed));
    alert.setInformativeText(&NSString::from_str(message));
    alert.addButtonWithTitle(&NSString::from_str(texts.quit));
    alert.runModal();
}

fn repair(original: &Path, texts: &Texts) -> Result<(), String> {
    let manual = |error: &dyn std::fmt::Display| format!("{error}\n\n{}", texts.manual_repair);
    let marker = std::env::temp_dir().join(REPAIR_MARKER);
    if repaired_recently(&marker, original) {
        return Err(manual(&texts.still_translocated));
    }
    std::fs::write(&marker, original.as_os_str().as_bytes()).map_err(|e| manual(&e))?;
    remove_quarantine(original).map_err(|e| manual(&e))?;
    relaunch_after_exit(original, None).map_err(|e| manual(&e))
}

// Without this, a macOS that keeps translocating the repaired copy would
// relaunch it forever.
fn repaired_recently(marker: &Path, original: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(marker) else {
        return false;
    };
    let recent = metadata
        .modified()
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|age| age < REPAIR_RETRY_WINDOW);
    recent && std::fs::read(marker).is_ok_and(|path| path == original.as_os_str().as_bytes())
}

fn remove_quarantine(path: &Path) -> std::io::Result<()> {
    let c_path = c_path(path).ok_or(std::io::ErrorKind::InvalidInput)?;
    let removed =
        unsafe { libc::removexattr(c_path.as_ptr(), QUARANTINE.as_ptr(), libc::XATTR_NOFOLLOW) };
    if removed != 0 {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() != Some(libc::ENOATTR) {
            return Err(error);
        }
    }
    if std::fs::symlink_metadata(path)?.is_dir() {
        for entry in std::fs::read_dir(path)? {
            remove_quarantine(&entry?.path())?;
        }
    }
    Ok(())
}

fn bundle_info(bundle: &Path) -> Option<(String, Option<semver::Version>)> {
    let info = plist::Value::from_file(bundle.join("Contents/Info.plist")).ok()?;
    let info = info.as_dictionary()?;
    let id = info.get("CFBundleIdentifier")?.as_string()?.to_owned();
    let version = info
        .get("CFBundleShortVersionString")
        .and_then(|version| version.as_string())
        .and_then(|version| semver::Version::parse(version).ok());
    Some((id, version))
}

fn is_running(bundle: &Path, id: &str) -> bool {
    NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(id))
        .iter()
        .filter_map(|app| app.bundleURL()?.path())
        .any(|path| Path::new(&path.to_string()) == bundle)
}

fn move_to_trash(path: &Path) -> Option<PathBuf> {
    let url = NSURL::fileURLWithPath(&NSString::from_str(path.to_str()?));
    let mut trashed = None;
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, Some(&mut trashed))
        .ok()?;
    Some(PathBuf::from(trashed?.path()?.to_string()))
}

fn disk_image_mount(path: &Path) -> Option<PathBuf> {
    let info = mount_of(path)?;
    let mount_point = unsafe { CStr::from_ptr(info.f_mntonname.as_ptr()) };
    let device = unsafe { CStr::from_ptr(info.f_mntfromname.as_ptr()) }
        .to_str()
        .ok()?;
    let output = Command::new("/usr/bin/hdiutil")
        .args(["info", "-plist"])
        .output()
        .ok()?;
    let images = plist::Value::from_reader_xml(output.stdout.as_slice()).ok()?;
    let is_image = images
        .as_dictionary()?
        .get("images")?
        .as_array()?
        .iter()
        .filter_map(|image| image.as_dictionary()?.get("system-entities")?.as_array())
        .flatten()
        .filter_map(|entity| entity.as_dictionary()?.get("dev-entry")?.as_string())
        .any(|entry| entry == device);
    is_image.then(|| PathBuf::from(std::ffi::OsStr::from_bytes(mount_point.to_bytes())))
}

fn install(source: &Path, texts: &Texts) -> Result<(), String> {
    let name = source.file_name().ok_or("Invalid app path")?;
    let (id, version) = bundle_info(source).ok_or("Can't read the app's Info.plist")?;
    let volume = disk_image_mount(source);
    let home_apps = dirs::home_dir()
        .ok_or("No home folder")?
        .join("Applications");
    let system_apps = PathBuf::from("/Applications");

    let existing = [&system_apps, &home_apps]
        .into_iter()
        .map(|dir| dir.join(name))
        .find(|path| path.exists());
    let target_dir = if let Some(existing) = &existing {
        let Some((existing_id, existing_version)) = bundle_info(existing) else {
            return Err(texts.not_ours.into());
        };
        if existing_id != id {
            return Err(texts.not_ours.into());
        }
        let running = is_running(existing, &id);
        // The installed copy updates itself through Sparkle, so it is opened
        // whenever replacing it isn't both safe and an upgrade.
        if existing_action(existing_version.as_ref(), version.as_ref(), running) == Existing::Open {
            return relaunch_after_exit(existing, volume).map_err(|e| e.to_string());
        }
        existing.parent().ok_or("Invalid app path")?.to_path_buf()
    } else if is_writable(&system_apps) {
        system_apps
    } else {
        // Standard accounts can't write to /Applications; a copy they own also
        // lets Sparkle update without an admin password.
        std::fs::create_dir_all(&home_apps).map_err(|e| e.to_string())?;
        home_apps
    };

    let target = target_dir.join(name);
    let mut staging_name = std::ffi::OsString::from(".");
    staging_name.push(name);
    staging_name.push(".installing");
    let staging = target_dir.join(staging_name);
    let _ = std::fs::remove_dir_all(&staging);
    let copy = Command::new("/usr/bin/ditto")
        .arg("--noqtn")
        .arg(source)
        .arg(&staging)
        .output()
        .map_err(|e| e.to_string())?;
    if !copy.status.success() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(String::from_utf8_lossy(&copy.stderr).trim().to_owned());
    }

    // The installed copy only goes once its replacement is complete, so a
    // failed copy never leaves the user without SocaDB.
    let trashed = match &existing {
        Some(existing) => match move_to_trash(existing) {
            Some(trashed) => Some((existing, trashed)),
            None => {
                let _ = std::fs::remove_dir_all(&staging);
                return relaunch_after_exit(existing, volume).map_err(|e| e.to_string());
            }
        },
        None => None,
    };
    if let Err(error) = std::fs::rename(&staging, &target) {
        let _ = std::fs::remove_dir_all(&staging);
        if let Some((existing, trashed)) = trashed {
            let _ = std::fs::rename(trashed, existing);
        }
        return Err(error.to_string());
    }
    relaunch_after_exit(&target, volume).map_err(|e| e.to_string())
}

fn relaunch_after_exit(app: &Path, volume: Option<PathBuf>) -> std::io::Result<()> {
    Command::new("/bin/sh")
        .arg("-c")
        .arg(RELAUNCH_SCRIPT)
        .arg("sh")
        .arg(std::process::id().to_string())
        .arg(app)
        .arg(volume.unwrap_or_default())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DMG_APP: &str = "/Volumes/SocaDB/SocaDB.app";
    const TRANSLOCATED: &str =
        "/private/var/folders/6w/x/T/AppTranslocation/386E1718-5649/d/SocaDB.app";

    fn on_dmg(path: &Path) -> bool {
        path.starts_with("/Volumes/SocaDB")
    }

    fn version(text: &str) -> semver::Version {
        semver::Version::parse(text).unwrap()
    }

    #[test]
    fn installed_copy_on_a_writable_volume_passes() {
        let launch = classify(Path::new("/Applications/SocaDB.app"), on_dmg, |_| None);
        assert_eq!(launch, Launch::Installed);
    }

    #[test]
    fn copy_on_a_writable_external_volume_passes() {
        let launch = classify(Path::new("/Volumes/SSD/SocaDB.app"), on_dmg, |_| None);
        assert_eq!(launch, Launch::Installed);
    }

    #[test]
    fn copy_on_the_disk_image_installs_from_it() {
        let launch = classify(Path::new(DMG_APP), on_dmg, |_| None);
        assert_eq!(launch, Launch::Install(DMG_APP.into()));
    }

    #[test]
    fn translocated_from_the_disk_image_installs_from_the_image() {
        let launch = classify(Path::new(TRANSLOCATED), on_dmg, |_| Some(DMG_APP.into()));
        assert_eq!(launch, Launch::Install(DMG_APP.into()));
    }

    #[test]
    fn translocated_from_applications_is_repaired_in_place() {
        let launch = classify(Path::new(TRANSLOCATED), on_dmg, |_| {
            Some("/Applications/SocaDB.app".into())
        });
        assert_eq!(launch, Launch::Repair("/Applications/SocaDB.app".into()));
    }

    #[test]
    fn translocated_without_its_original_installs_from_the_running_copy() {
        let launch = classify(Path::new(TRANSLOCATED), on_dmg, |_| None);
        assert_eq!(launch, Launch::Install(TRANSLOCATED.into()));
    }

    #[test]
    fn older_installed_copy_is_replaced() {
        let action = existing_action(Some(&version("0.1.2")), Some(&version("0.1.3")), false);
        assert_eq!(action, Existing::Replace);
    }

    #[test]
    fn running_installed_copy_is_opened() {
        let action = existing_action(Some(&version("0.1.2")), Some(&version("0.1.3")), true);
        assert_eq!(action, Existing::Open);
    }

    #[test]
    fn same_or_newer_installed_copy_is_opened() {
        let ours = version("0.1.3");
        assert_eq!(
            existing_action(Some(&version("0.1.3")), Some(&ours), false),
            Existing::Open
        );
        assert_eq!(
            existing_action(Some(&version("0.2.0")), Some(&ours), false),
            Existing::Open
        );
    }

    #[test]
    fn unreadable_versions_open_the_installed_copy() {
        let ours = version("0.1.3");
        assert_eq!(existing_action(None, Some(&ours), false), Existing::Open);
        assert_eq!(
            existing_action(Some(&version("0.1.2")), None, false),
            Existing::Open
        );
    }

    #[test]
    fn repair_marker_only_blocks_a_recent_attempt_on_the_same_copy() {
        let dir = std::env::temp_dir().join(format!("socadb-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("marker");
        let original = Path::new("/Applications/SocaDB.app");
        assert!(!repaired_recently(&marker, original));
        std::fs::write(&marker, original.as_os_str().as_bytes()).unwrap();
        assert!(repaired_recently(&marker, original));
        assert!(!repaired_recently(
            &marker,
            Path::new("/Users/x/SocaDB.app")
        ));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
