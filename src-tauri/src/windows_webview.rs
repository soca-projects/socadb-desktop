use log::Level;
use tauri::Manager;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows::core::Interface;

fn turn_off_browser_shortcuts(
    webview: &tauri::webview::PlatformWebview,
) -> windows::core::Result<()> {
    // SAFETY: COM calls on the controller Tauri owns, made on the main thread,
    // where with_webview runs its closure.
    unsafe {
        webview
            .controller()
            .CoreWebView2()?
            .Settings()?
            .cast::<ICoreWebView2Settings3>()?
            .SetAreBrowserAcceleratorKeysEnabled(false)
    }
}

// WebView2 keeps a browser's shortcuts: F5 and Ctrl+R reload the whole app and
// lose the undo history, Ctrl+P prints the page, F3 opens a find bar. The page
// still receives these keys, so the app's own shortcuts keep working.
pub fn disable_browser_shortcuts(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let scheduled = window.with_webview(|webview| {
        if let Err(e) = turn_off_browser_shortcuts(&webview) {
            crate::log_event!(
                Level::Warn,
                "window.browser_shortcuts.failed",
                e.to_string()
            );
        }
    });
    if let Err(e) = scheduled {
        crate::log_event!(
            Level::Warn,
            "window.browser_shortcuts.failed",
            e.to_string()
        );
    }
}
