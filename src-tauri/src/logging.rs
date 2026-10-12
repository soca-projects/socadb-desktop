use log::{Level, LevelFilter};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

pub const TARGET: &str = "socadb";
const MAX_FILE_BYTES: u128 = 5_000_000;
const ROTATED_FILES: usize = 4;
const MAX_MESSAGE: usize = 2000;
pub const MAX_STDERR_LINE: usize = 500;

const RATE_WINDOW: Duration = Duration::from_secs(60);
const RATE_LIMIT: u32 = 20;

static LAUNCH_ID: OnceLock<String> = OnceLock::new();
static RATES: OnceLock<Mutex<HashMap<String, Rate>>> = OnceLock::new();

struct Rate {
    since: Instant,
    count: u32,
    dropped: u32,
}
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

// Registered from setup rather than on the builder: a plugin that fails to
// start on the builder aborts the launch, and a log is never worth that.
pub fn init(app: &tauri::AppHandle) {
    use tauri::Manager;
    let to_file = app
        .path()
        .app_log_dir()
        .is_ok_and(|dir| can_write(&dir.join(format!("{}.log", file_stem()))));
    if let Err(e) = app.plugin(plugin(to_file)) {
        eprintln!("SocaDB: logging disabled: {e}");
        return;
    }
    if !to_file {
        emit(
            Level::Warn,
            "app.log_dir.unwritable",
            "The log directory can't be written; logging to stderr only",
            json!({}),
        );
    }
}

fn can_write(file: &std::path::Path) -> bool {
    file.parent()
        .is_some_and(|dir| std::fs::create_dir_all(dir).is_ok())
        && std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file)
            .is_ok()
}

fn plugin<R: tauri::Runtime>(to_file: bool) -> tauri::plugin::TauriPlugin<R> {
    let target = if to_file {
        TargetKind::LogDir {
            file_name: Some(file_stem().into()),
        }
    } else {
        TargetKind::Stderr
    };
    let mut builder = tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(target))
        .rotation_strategy(RotationStrategy::KeepSome(ROTATED_FILES))
        .max_file_size(MAX_FILE_BYTES)
        .level(if cfg!(debug_assertions) {
            LevelFilter::Debug
        } else {
            LevelFilter::Info
        })
        // Our own events and the webview's; dependencies only from warn up.
        .filter(|m| {
            if m.target() == TARGET || m.target().starts_with("webview") {
                return true;
            }
            // Dependencies (tao, wry…) can log in a loop too; their summary
            // comes from flush_suppressed, since logging from a filter recurses.
            m.level() <= Level::Warn
                && admit(&format!("dep:{}", m.target()), Instant::now()).admitted
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
    if cfg!(debug_assertions) && to_file {
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

// A loop that fails (a page probing the bridge port, EMFILE) would otherwise
// rotate the whole history out within minutes.
struct Admission {
    admitted: bool,
    // The first line over the quota: worth a note, since the summary may never
    // be written if the app dies before the window ends.
    first_drop: bool,
    reported: u32,
}

fn admit(code: &str, now: Instant) -> Admission {
    let mut rates = RATES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let rate = rates.entry(code.to_owned()).or_insert(Rate {
        since: now,
        count: 0,
        dropped: 0,
    });
    let mut reported = 0;
    if now.duration_since(rate.since) >= RATE_WINDOW {
        reported = rate.dropped;
        *rate = Rate {
            since: now,
            count: 0,
            dropped: 0,
        };
    }
    rate.count += 1;
    if rate.count > RATE_LIMIT {
        rate.dropped += 1;
        return Admission {
            admitted: false,
            first_drop: rate.dropped == 1,
            reported,
        };
    }
    Admission {
        admitted: true,
        first_drop: false,
        reported,
    }
}

// Counts dropped since the last summary, written before the app stops or
// panics so a cut just before an incident still shows.
pub fn flush_suppressed() {
    let pending: Vec<(String, u32)> = {
        let mut rates = RATES
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        rates
            .iter_mut()
            .filter(|(_, rate)| rate.dropped > 0)
            .map(|(code, rate)| (code.clone(), std::mem::take(&mut rate.dropped)))
            .collect()
    };
    for (code, dropped) in pending {
        write(
            Level::Warn,
            "log.suppressed",
            "Repeated lines were dropped",
            json!({ "code": code, "dropped": dropped }),
        );
    }
}

pub fn emit(level: Level, code: &str, msg: &str, ctx: Value) {
    // A line the level filter drops must not use up its code's quota.
    if !log::log_enabled!(target: TARGET, level) {
        return;
    }
    if !matches!(code, "app.panic" | "app.start" | "app.stop") {
        let admission = admit(code, Instant::now());
        if admission.reported > 0 {
            write(
                Level::Warn,
                "log.suppressed",
                "Repeated lines were dropped",
                json!({ "code": code, "dropped": admission.reported }),
            );
        }
        if admission.first_drop {
            write(
                Level::Warn,
                "log.suppressing",
                "Over 20 lines a minute: further lines of this code are dropped",
                json!({ "code": code }),
            );
        }
        if !admission.admitted {
            return;
        }
    }
    write(level, code, msg, ctx);
}

fn write(level: Level, code: &str, msg: &str, ctx: Value) {
    let msg = truncate(msg, MAX_MESSAGE);
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

// Escapes are skipped so `\"name\"` inside a JSON string can't flip the
// state; a quote right after a letter or digit is an apostrophe ("can't").
pub fn mask_quoted(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    let mut previous: Option<char> = None;
    let mut quote: Option<char> = None;
    while let Some(c) = chars.next() {
        match quote {
            Some(open) => {
                if c == '\\' {
                    chars.next();
                } else if c == open {
                    out.push(open);
                    quote = None;
                }
            }
            None => {
                out.push(c);
                let opens = c == '"' || (c == '\'' && !previous.is_some_and(char::is_alphanumeric));
                if opens {
                    out.push('…');
                    quote = Some(c);
                }
            }
        }
        previous = Some(c);
    }
    out
}

// What a release log keeps of an agent's last stderr lines: runners can echo
// request text and raw agent events, so only their shape survives.
pub fn release_tail(lines: &[String]) -> Vec<String> {
    let start = lines.len().saturating_sub(10);
    lines[start..]
        .iter()
        .map(|line| truncate(&mask_quoted(line), 200))
        .collect()
}

pub fn truncate(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        Some((cut, _)) => format!("{}…", &text[..cut]),
        None => text.to_owned(),
    }
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
        flush_suppressed();
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
    flush_suppressed();
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
    fn a_flood_of_one_code_is_capped_then_counted() {
        let start = Instant::now();
        let admissions: Vec<Admission> = (0..30).map(|_| admit("test.flood", start)).collect();
        assert_eq!(
            admissions.iter().filter(|a| a.admitted).count(),
            RATE_LIMIT as usize
        );
        assert_eq!(admissions.iter().filter(|a| a.first_drop).count(), 1);
        assert!(admissions[RATE_LIMIT as usize].first_drop);
        let next = admit("test.flood", start + RATE_WINDOW);
        assert!(next.admitted && next.reported == 10);
        assert!(admit("test.other", start).admitted);
    }

    #[test]
    fn release_tails_keep_the_shape_of_runner_lines() {
        let lines: Vec<String> = (0..15)
            .map(|i| format!(r#"line {i} {{"type":"agent_message","text":"secret plan"}}"#))
            .collect();
        let tail = release_tail(&lines);
        assert_eq!(tail.len(), 10);
        assert_eq!(tail[0], r#"line 5 {"…":"…","…":"…"}"#);
        assert!(!tail.iter().any(|l| l.contains("secret")));
    }

    #[test]
    fn quoted_text_is_masked_despite_escapes() {
        assert_eq!(
            mask_quoted(r#"{"message":"I created \"patients_hiv\" tables"}"#),
            r#"{"…":"…"}"#
        );
        assert_eq!(mask_quoted("can't find 'patients_hiv'"), "can't find '…'");
    }

    #[test]
    fn long_messages_are_cut_on_a_char_boundary() {
        assert_eq!(truncate("éééé", 2), "éé…");
        assert_eq!(truncate("short", 10), "short");
    }

    #[test]
    fn plain_messages_become_msg() {
        let line = json_line("t", "warn", "L1", "webview::App.tsx:10", "boom");
        let v: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(v["src"], "ui");
        assert_eq!(v["msg"], "boom");
    }
}
