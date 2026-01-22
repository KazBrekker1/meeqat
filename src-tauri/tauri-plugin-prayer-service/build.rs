const COMMANDS: &[&str] = &[
    "start_service",
    "stop_service",
    "update_prayer_times",
    "is_service_running",
    "check_notification_permission",
    "request_notification_permission",
    "check_battery_optimization",
    "request_battery_optimization_exemption",
    "open_app_settings",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
