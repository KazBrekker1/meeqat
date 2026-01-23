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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hijri_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gregorian_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePrayerTimesArgs {
    pub prayers: Vec<PrayerTimeData>,
    pub next_prayer_index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hijri_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gregorian_date: Option<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryOptimizationStatus {
    pub is_ignoring: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetMockTimeOffsetArgs {
    pub offset_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockTimeOffsetResult {
    pub offset_ms: i64,
}
