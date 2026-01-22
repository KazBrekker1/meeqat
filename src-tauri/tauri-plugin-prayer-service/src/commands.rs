use tauri::{command, AppHandle, Runtime};

use crate::models::{NotificationPermissionStatus, PermissionResult, ServiceStatus, StartServiceArgs, UpdatePrayerTimesArgs};
use crate::error::Result;
use crate::PrayerServiceExt;

#[command]
pub fn start_service<R: Runtime>(
    app: AppHandle<R>,
    args: StartServiceArgs,
) -> Result<()> {
    app.prayer_service().start_service(args)
}

#[command]
pub fn stop_service<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.prayer_service().stop_service()
}

#[command]
pub fn update_prayer_times<R: Runtime>(
    app: AppHandle<R>,
    args: UpdatePrayerTimesArgs,
) -> Result<()> {
    app.prayer_service().update_prayer_times(args)
}

#[command]
pub fn is_service_running<R: Runtime>(app: AppHandle<R>) -> Result<ServiceStatus> {
    app.prayer_service().is_service_running()
}

#[command]
pub fn check_notification_permission<R: Runtime>(app: AppHandle<R>) -> Result<NotificationPermissionStatus> {
    app.prayer_service().check_notification_permission()
}

#[command]
pub fn request_notification_permission<R: Runtime>(app: AppHandle<R>) -> Result<PermissionResult> {
    app.prayer_service().request_notification_permission()
}
