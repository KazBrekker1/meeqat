use tauri::{self};

#[cfg(desktop)]
mod notify;
#[cfg(desktop)]
mod together;
#[cfg(desktop)]
mod tray;

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// `meeqat://` links (sign-in hand-off, room invites) are handled in the webview;
/// here we only surface the main window, which may be hidden in the tray.
#[cfg(desktop)]
fn setup_deep_links(app: &tauri::AppHandle) {
    use tauri_plugin_deep_link::DeepLinkExt;

    // Installers register the scheme; this covers dev runs and AppImages.
    #[cfg(any(windows, target_os = "linux"))]
    if let Err(err) = app.deep_link().register_all() {
        eprintln!("[deep-link] register failed: {err}");
    }

    let handle = app.clone();
    app.deep_link().on_open_url(move |_event| tray::show_main(&handle));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Must be the first plugin. Windows/Linux start a second process for a
    // `meeqat://` link; its `deep-link` feature forwards the URL to the running
    // instance (as an onOpenUrl event) and this callback brings the window up.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        tray::show_main(app);
    }));

    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_prayer_service::init())
        .invoke_handler(tauri::generate_handler![
            quit_app,
            #[cfg(desktop)]
            tray::hide_tray_popover,
            #[cfg(desktop)]
            tray::set_tray_snapshot,
            #[cfg(desktop)]
            tray::get_tray_snapshot,
            #[cfg(desktop)]
            notify::schedule_notifications,
            #[cfg(desktop)]
            notify::cancel_notifications,
            #[cfg(desktop)]
            together::together_set_session,
            #[cfg(desktop)]
            together::together_clear_session,
            #[cfg(desktop)]
            together::together_get_calls,
            #[cfg(desktop)]
            together::together_join_call,
            #[cfg(desktop)]
            together::together_open_room,
        ]);

    // Positioner plugin is desktop-only (kept for the page's drag/position helpers)
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            tray::setup(app.handle())?;
            notify::setup(app.handle());
            setup_deep_links(app.handle());
            together::setup(app.handle());
            Ok(())
        });

    // macOS: the tray popover is an NSPanel so it can appear over full-screen apps.
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    // Auto-update is desktop-only; Android/iOS update via a separate in-app flow.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
