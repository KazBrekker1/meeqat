use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrayerTimeData {
    pub prayer_name: String,
    pub prayer_time: i64, // Unix timestamp in milliseconds
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartServiceArgs {
    pub prayers: Vec<PrayerTimeData>,
    pub next_prayer_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePrayerTimesArgs {
    pub prayers: Vec<PrayerTimeData>,
    pub next_prayer_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub is_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPermissionStatus {
    pub granted: bool,
    pub can_request: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionResult {
    pub granted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryOptimizationStatus {
    pub is_ignoring_battery_optimizations: bool,
    pub can_request: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryOptimizationResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_sent: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub already_exempt: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub not_required: Option<bool>,
}
