use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub mod commands;
pub mod error;
pub mod mobile;
pub mod models;

pub use error::{Error, Result};
pub use models::*;

use mobile::PrayerService;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the prayer service APIs.
pub trait PrayerServiceExt<R: Runtime> {
    fn prayer_service(&self) -> &PrayerService<R>;
}

impl<R: Runtime, T: Manager<R>> PrayerServiceExt<R> for T {
    fn prayer_service(&self) -> &PrayerService<R> {
        self.state::<PrayerService<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("prayer-service")
        .invoke_handler(tauri::generate_handler![
            commands::start_service,
            commands::stop_service,
            commands::update_prayer_times,
            commands::is_service_running,
            commands::open_app_settings,
            commands::check_notification_permission,
            commands::request_notification_permission,
            commands::check_battery_optimization,
            commands::request_battery_optimization_exemption,
            commands::set_mock_time_offset,
            commands::get_mock_time_offset,
            commands::clear_mock_time_offset,
        ])
        .setup(|app, api| {
            let prayer_service = mobile::init(app, api)?;
            app.manage(prayer_service);
            Ok(())
        })
        .build()
}
