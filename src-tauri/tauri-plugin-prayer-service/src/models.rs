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
