use log::Level;
use tauri::Manager;
use webview2_com::take_pwstr;
use webview2_com::ContextMenuRequestedEventHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2ContextMenuRequestedEventArgs, ICoreWebView2Settings3, ICoreWebView2_11,
};
use windows::core::{Interface, PWSTR};

use crate::field_menu::items_to_remove;

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

fn remove_browser_items(
    args: &ICoreWebView2ContextMenuRequestedEventArgs,
) -> windows::core::Result<()> {
    // SAFETY: COM calls on the event arguments WebView2 hands to this handler, on the
    // main thread. Indexes stay below the count, and removals go from last to first.
    unsafe {
        let items = args.MenuItems()?;
        let mut count = 0;
        items.Count(&mut count)?;
        let mut names = Vec::new();
        for index in 0..count {
            let mut name = PWSTR::null();
            let read = items.GetValueAtIndex(index)?.Name(&mut name);
            names.push(read.ok().map(|()| take_pwstr(name)));
        }
        for index in items_to_remove(&names) {
            items.RemoveValueAtIndex(index)?;
        }
    }
    Ok(())
}

fn filter_context_menu(webview: &tauri::webview::PlatformWebview) -> windows::core::Result<()> {
    let handler = ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args {
            if let Err(e) = remove_browser_items(&args) {
                crate::log_event!(Level::Warn, "window.field_menu.failed", e.to_string());
            }
        }
        Ok(())
    }));
    let mut token = 0;
    // SAFETY: COM calls on the controller Tauri owns, made on the main thread, where
    // with_webview runs its closure. The handler lives as long as the webview.
    unsafe {
        webview
            .controller()
            .CoreWebView2()?
            .cast::<ICoreWebView2_11>()?
            .add_ContextMenuRequested(&handler, &mut token)
    }
}

pub fn trim_field_menu(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let scheduled = window.with_webview(|webview| {
        if let Err(e) = filter_context_menu(&webview) {
            crate::log_event!(Level::Warn, "window.field_menu.failed", e.to_string());
        }
    });
    if let Err(e) = scheduled {
        crate::log_event!(Level::Warn, "window.field_menu.failed", e.to_string());
    }
}
