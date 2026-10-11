use log::{Level, LevelFilter};
use serde_json::{json, Map, Value};
use std::sync::OnceLock;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

pub const TARGET: &str = "socadb";
const MAX_FILE_BYTES: u128 = 5_000_000;
const ROTATED_FILES: usize = 4;

static LAUNCH_ID: OnceLock<String> = OnceLock::new();
static HOMES: OnceLock<Vec<String>> = OnceLock::new();

pub fn launch_id() -> &'static str {
    LAUNCH_ID.get_or_init(|| {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("{nanos:x}-{:x}", std::process::id())
    })
}

pub fn file_stem() -> &'static str {
    if cfg!(debug_assertions) {
        "socadb-dev"
    } else {
        "socadb"
    }
}

pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let mut builder = tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some(file_stem().into()),
        }))
        .rotation_strategy(RotationStrategy::KeepSome(ROTATED_FILES))
        .max_file_size(MAX_FILE_BYTES)
        .level(if cfg!(debug_assertions) {
            LevelFilter::Debug
        } else {
            LevelFilter::Info
        })
        // Our own events and the webview's; dependencies only from warn up.
        .filter(|m| {
            m.target() == TARGET || m.target().starts_with("webview") || m.level() <= Level::Warn
        })
        .format(|out, message, record| {
            out.finish(format_args!(
                "{}",
                json_line(
                    &now(),
                    &record.level().as_str().to_lowercase(),
                    launch_id(),
                    record.target(),
                    &scrub(&message.to_string()),
                )
            ))
        });
    if cfg!(debug_assertions) {
        builder = builder.target(Target::new(TargetKind::Stdout));
    }
    builder.build()
}

fn now() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

fn source(target: &str) -> &str {
    if target.starts_with("webview") {
        "ui"
    } else if target == TARGET {
        "rust"
    } else {
        target
    }
}

fn json_line(ts: &str, level: &str, launch: &str, target: &str, text: &str) -> String {
    let body = match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) if map.contains_key("code") => map,
        _ => {
            let mut map = Map::new();
            map.insert("msg".into(), Value::String(text.to_owned()));
            map
        }
    };
    let mut line = format!(
        "{{\"ts\":{},\"level\":{},\"launch\":{},\"src\":{}",
        json!(ts),
        json!(level),
        json!(launch),
        json!(source(target))
    );
    for (key, value) in body {
        line.push_str(&format!(",{}:{}", json!(key), value));
    }
    line.push('}');
    line
}

fn homes() -> &'static [String] {
    HOMES.get_or_init(|| {
        dirs::home_dir()
            .map(|h| h.to_string_lossy().into_owned())
            .filter(|h| h.len() > 1)
            .into_iter()
            .collect()
    })
}

pub fn scrub(text: &str) -> String {
    scrub_with_homes(text, homes())
}

fn scrub_with_homes<S: AsRef<str>>(text: &str, homes: &[S]) -> String {
    let mut out = text.to_owned();
    for home in homes {
        let home = home.as_ref();
        out = out.replace(home, "~");
        out = out.replace(&home.replace('\\', "\\\\"), "~");
    }
    TOKEN_PREFIXES
        .iter()
        .fold(out, |text, (prefix, min)| mask_after(&text, prefix, *min))
}

// Prefixes of API keys and tokens an error message may carry, with the
// shortest secret part worth masking after each.
const TOKEN_PREFIXES: &[(&str, usize)] = &[
    ("sk-", 16),
    ("Bearer ", 12),
    ("bearer ", 12),
    ("ghp_", 20),
    ("gho_", 20),
    ("ghu_", 20),
    ("ghs_", 20),
    ("ghr_", 20),
    ("github_pat_", 20),
    ("glpat-", 16),
    ("xoxb-", 16),
    ("xoxp-", 16),
    ("xapp-", 16),
    ("AKIA", 16),
    ("AIza", 30),
    ("eyJ", 30),
];

// A minimum length keeps ordinary words that contain the prefix, like "task-list".
fn mask_after(text: &str, prefix: &str, min: usize) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(i) = rest.find(prefix) {
        let after = &rest[i + prefix.len()..];
        let len = after
            .char_indices()
            .find(|(_, c)| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')))
            .map_or(after.len(), |(j, _)| j);
        out.push_str(&rest[..i]);
        if len >= min {
            out.push_str(prefix);
            out.push_str("[redacted]");
        } else {
            out.push_str(&rest[i..i + prefix.len() + len]);
        }
        rest = &after[len..];
    }
    out.push_str(rest);
    out
}

pub fn emit(level: Level, code: &str, msg: &str, ctx: Value) {
    let area = code.split('.').next().unwrap_or("app");
    let payload = json!({ "area": area, "code": code, "msg": msg, "ctx": ctx });
    log::log!(target: TARGET, level, "{payload}");
}

#[macro_export]
macro_rules! log_event {
    ($level:expr, $code:literal, $msg:expr $(, $key:literal => $value:expr)* $(,)?) => {
        $crate::logging::emit(
            $level,
            $code,
            &$msg.to_string(),
            serde_json::json!({ $($key: $value),* }),
        )
    };
}

pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_owned())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        emit(
            Level::Error,
            "app.panic",
            &message,
            json!({
                "location": info.location().map(|l| format!("{}:{}", l.file(), l.line())),
                "thread": std::thread::current().name().unwrap_or("?").to_owned(),
                "backtrace": std::backtrace::Backtrace::force_capture().to_string(),
            }),
        );
        log::logger().flush();
        default(info);
    }));
}

fn install_kind() -> &'static str {
    let exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    if exe.contains("/AppTranslocation/") {
        "translocated"
    } else if exe.starts_with("/Applications/") {
        "applications"
    } else if exe.starts_with("/Volumes/") {
        "volume"
    } else if cfg!(debug_assertions) {
        "dev"
    } else {
        "other"
    }
}

pub fn log_start(app: &tauri::AppHandle) {
    let os = os_info::get();
    emit(
        Level::Info,
        "app.start",
        "SocaDB started",
        json!({
            "version": app.package_info().version.to_string(),
            "os": std::env::consts::OS,
            "os_version": os.version().to_string(),
            "arch": std::env::consts::ARCH,
            "install": install_kind(),
            "dev": cfg!(debug_assertions),
        }),
    );
}

pub fn log_stop() {
    emit(Level::Info, "app.stop", "SocaDB stopped", json!({}));
    log::logger().flush();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_becomes_tilde_raw_and_escaped() {
        let s = scrub_with_homes(
            r#"{"p":"/Users/ana/x.soca","w":"C:\\Users\\ana\\y"}"#,
            &["/Users/ana", r"C:\Users\ana"],
        );
        assert_eq!(s, r#"{"p":"~/x.soca","w":"~\\y"}"#);
    }

    #[test]
    fn api_keys_and_bearer_tokens_are_masked() {
        let s = scrub_with_homes(
            "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 and Bearer abc.def-ghi_jkl123456 end",
            &[] as &[&str],
        );
        assert_eq!(s, "key sk-[redacted] and Bearer [redacted] end");
        assert_eq!(
            scrub_with_homes("task-list sk-short", &[] as &[&str]),
            "task-list sk-short"
        );
    }

    #[test]
    fn third_party_tokens_are_masked() {
        let s = scrub_with_homes(
            "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0 slack xoxb-1234567890-abcdefghij",
            &[] as &[&str],
        );
        assert_eq!(
            s,
            "GITHUB_TOKEN=ghp_[redacted] jwt eyJ[redacted] slack xoxb-[redacted]"
        );
    }

    #[test]
    fn coded_events_keep_their_fields() {
        let line = json_line(
            "2026-10-11T00:00:00.000Z",
            "error",
            "L1",
            TARGET,
            r#"{"area":"agent","code":"agent.exit.signal","msg":"m","ctx":{"provider":"codex"}}"#,
        );
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["src"], "rust");
        assert_eq!(v["code"], "agent.exit.signal");
        assert_eq!(v["ctx"]["provider"], "codex");
        assert!(line.starts_with(
            r#"{"ts":"2026-10-11T00:00:00.000Z","level":"error","launch":"L1","src":"rust""#
        ));
    }

    #[test]
    fn plain_messages_become_msg() {
        let line = json_line("t", "warn", "L1", "webview::App.tsx:10", "boom");
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["src"], "ui");
        assert_eq!(v["msg"], "boom");
    }
}
