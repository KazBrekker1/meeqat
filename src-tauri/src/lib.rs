use tauri::{self};

#[cfg(desktop)]
mod notify;
#[cfg(desktop)]
mod tray;

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
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
        ]);

    // Positioner plugin is desktop-only (kept for the page's drag/position helpers)
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            tray::setup(app.handle())?;
            notify::setup(app.handle());
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
