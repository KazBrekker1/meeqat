const COMMANDS: &[&str] = &[
    "update_prayer_times",
    "check_notification_permission",
    "request_notification_permission",
    "check_battery_optimization",
    "request_battery_optimization_exemption",
    "open_app_settings",
    "set_mock_time_offset",
    "get_mock_time_offset",
    "clear_mock_time_offset",
    "install_apk",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
