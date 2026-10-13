use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrayerTimeData {
    pub prayer_name: String,
    pub prayer_time: i64, // Unix timestamp in milliseconds
    pub label: String,
}

/// One day of the widget's look-ahead window: that day's prayers plus its
/// pre-formatted header dates.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingDay {
    pub prayers: Vec<PrayerTimeData>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hijri_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_day_prayer_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_day_prayer_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_day_prayer_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_24_hour: Option<bool>,
    /// Ascending, starting with today (up to 7 days). Absent from older frontends.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upcoming_days: Option<Vec<UpcomingDay>>,
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

/// Forwarded to Kotlin as-is. `on_progress` serialises to the `__CHANNEL__:id` form
/// the Kotlin side deserialises back into a Channel, so it can stream download
/// progress straight to JS. Serialize-only: a Channel is built from the IPC call.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallApkArgs {
    pub url: String,
    pub on_progress: tauri::ipc::Channel,
}
