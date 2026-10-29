use std::ptr::NonNull;

use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSWindow, NSWindowWillExitFullScreenNotification};
use objc2_foundation::{ns_string, NSNotification, NSNotificationCenter};
use tauri::{Emitter, Manager};

use crate::log_event;

// Tauri reports leaving full screen once macOS ends its animation, but the
// window buttons come back over the toolbar as soon as it starts.
pub fn relay_exit_start(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let ns_window = match window.ns_window() {
        Ok(ns_window) => ns_window,
        Err(e) => {
            log_event!(log::Level::Warn, "window.fullscreen.observe_failed", e);
            return;
        }
    };
    let handle = app.handle().clone();
    let block = RcBlock::new(move |_: NonNull<NSNotification>| {
        if let Err(e) = handle.emit("will-exit-fullscreen", ()) {
            log_event!(log::Level::Warn, "window.fullscreen.observe_failed", e);
        }
    });
    // SAFETY: `ns_window` is the main window's NSWindow, alive for the whole
    // app. AppKit posts the notification on the main thread and the block only
    // emits a Tauri event.
    unsafe {
        let ns_window: &AnyObject = &*ns_window.cast();
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSWindowWillExitFullScreenNotification),
            Some(ns_window),
            None,
            &block,
        );
    }
}

// AppKit saves the frame in points for each screen setup, so it comes back right
// on a screen with another scale or after one is unplugged. It never reopens in
// full screen, like apps under macOS's default "close windows when quitting".
pub fn remember_frame(app: &tauri::App) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    match window.ns_window() {
        // SAFETY: `ns_window` is the main window's NSWindow, alive for the
        // whole app, and setup runs on the main thread.
        Ok(ns_window) => unsafe {
            let ns_window: &NSWindow = &*ns_window.cast();
            let name = ns_string!("main");
            ns_window.setFrameUsingName(name);
            ns_window.setFrameAutosaveName(name);
        },
        Err(e) => log_event!(log::Level::Warn, "window.frame.autosave_failed", e),
    }
}

// Changing the close button puts the window buttons back in AppKit's default
// place; Tauri's content view moves them to trafficLightPosition when it redraws.
#[tauri::command]
pub fn set_document_edited(window: tauri::WebviewWindow, edited: bool) {
    let target = window.clone();
    let result = window.run_on_main_thread(move || match target.ns_window() {
        // SAFETY: `ns_window` is this window's live NSWindow, used on the main
        // thread for the duration of the call.
        Ok(ns_window) => unsafe {
            let ns_window: &NSWindow = &*ns_window.cast();
            ns_window.setDocumentEdited(edited);
            if let Some(view) = ns_window.contentView() {
                view.setNeedsDisplay(true);
            }
        },
        Err(e) => log_event!(log::Level::Warn, "window.document_edited.failed", e),
    });
    if let Err(e) = result {
        log_event!(log::Level::Warn, "window.document_edited.failed", e);
    }
}
