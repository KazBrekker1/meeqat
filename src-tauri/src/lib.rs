use tauri::{self};

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
        .plugin(tauri_plugin_prayer_service::init())
        .invoke_handler(tauri::generate_handler![quit_app]);

    // Positioner plugin is desktop-only (for tray popover positioning)
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_positioner::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
