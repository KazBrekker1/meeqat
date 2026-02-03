use tauri::{command, AppHandle, Runtime};

use crate::models::{ServiceStatus, StartServiceArgs, UpdatePrayerTimesArgs, PrayerTimeData, NotificationPermissionStatus, BatteryOptimizationStatus, SetMockTimeOffsetArgs, MockTimeOffsetResult};
use crate::error::Result;
use crate::PrayerServiceExt;

#[command]
pub fn start_service<R: Runtime>(
    app: AppHandle<R>,
    prayers: Vec<PrayerTimeData>,
    next_prayer_index: usize,
    hijri_date: Option<String>,
    gregorian_date: Option<String>,
    next_day_prayer_name: Option<String>,
    next_day_prayer_time: Option<i64>,
    next_day_prayer_label: Option<String>,
) -> Result<()> {
    let args = StartServiceArgs { prayers, next_prayer_index, hijri_date, gregorian_date, next_day_prayer_name, next_day_prayer_time, next_day_prayer_label };
    app.prayer_service().start_service(args)
}

#[command]
pub fn stop_service<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.prayer_service().stop_service()
}

#[command]
pub fn update_prayer_times<R: Runtime>(
    app: AppHandle<R>,
    prayers: Vec<PrayerTimeData>,
    next_prayer_index: usize,
    hijri_date: Option<String>,
    gregorian_date: Option<String>,
    next_day_prayer_name: Option<String>,
    next_day_prayer_time: Option<i64>,
    next_day_prayer_label: Option<String>,
) -> Result<()> {
    let args = UpdatePrayerTimesArgs { prayers, next_prayer_index, hijri_date, gregorian_date, next_day_prayer_name, next_day_prayer_time, next_day_prayer_label };
    app.prayer_service().update_prayer_times(args)
}

#[command]
pub fn is_service_running<R: Runtime>(app: AppHandle<R>) -> Result<ServiceStatus> {
    app.prayer_service().is_service_running()
}

#[command]
pub fn open_app_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.prayer_service().open_app_settings()
}

#[command]
pub fn check_notification_permission<R: Runtime>(app: AppHandle<R>) -> Result<NotificationPermissionStatus> {
    app.prayer_service().check_notification_permission()
}

#[command]
pub fn request_notification_permission<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.prayer_service().request_notification_permission()
}

#[command]
pub fn check_battery_optimization<R: Runtime>(app: AppHandle<R>) -> Result<BatteryOptimizationStatus> {
    app.prayer_service().check_battery_optimization()
}

#[command]
pub fn request_battery_optimization_exemption<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.prayer_service().request_battery_optimization_exemption()
}

#[command]
pub fn set_mock_time_offset<R: Runtime>(app: AppHandle<R>, offset_ms: i64) -> Result<()> {
    let args = SetMockTimeOffsetArgs { offset_ms };
    app.prayer_service().set_mock_time_offset(args)
}

#[command]
pub fn get_mock_time_offset<R: Runtime>(app: AppHandle<R>) -> Result<MockTimeOffsetResult> {
    app.prayer_service().get_mock_time_offset()
}

#[command]
pub fn clear_mock_time_offset<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.prayer_service().clear_mock_time_offset()
}
