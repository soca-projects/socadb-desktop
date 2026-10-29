use std::ptr::NonNull;

use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2_app_kit::NSWindowWillExitFullScreenNotification;
use objc2_foundation::{NSNotification, NSNotificationCenter};
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
