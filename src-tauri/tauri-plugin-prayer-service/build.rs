const COMMANDS: &[&str] = &[
    "start_service",
    "stop_service",
    "update_prayer_times",
    "is_service_running",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
