use serde::de::DeserializeOwned;
use tauri::{
    plugin::PluginApi,
    AppHandle, Runtime,
};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

use crate::models::{NotificationPermissionStatus, PermissionResult, ServiceStatus, StartServiceArgs, UpdatePrayerTimesArgs};
use crate::error::{Error, Result};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.meeqat.plugin.prayerservice";

/// Access to the prayer service APIs.
#[cfg(target_os = "android")]
pub struct PrayerService<R: Runtime>(PluginHandle<R>);

#[cfg(not(target_os = "android"))]
pub struct PrayerService<R: Runtime>(std::marker::PhantomData<fn() -> R>);

// Ensure Send + Sync for non-Android
#[cfg(not(target_os = "android"))]
unsafe impl<R: Runtime> Send for PrayerService<R> {}
#[cfg(not(target_os = "android"))]
unsafe impl<R: Runtime> Sync for PrayerService<R> {}

impl<R: Runtime> PrayerService<R> {
    #[cfg(target_os = "android")]
    pub fn start_service(&self, args: StartServiceArgs) -> Result<()> {
        self.0
            .run_mobile_plugin("startService", args)
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(not(target_os = "android"))]
    pub fn start_service(&self, _args: StartServiceArgs) -> Result<()> {
        Err(Error::PlatformNotSupported)
    }

    #[cfg(target_os = "android")]
    pub fn stop_service(&self) -> Result<()> {
        self.0
            .run_mobile_plugin::<()>("stopService", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(not(target_os = "android"))]
    pub fn stop_service(&self) -> Result<()> {
        Err(Error::PlatformNotSupported)
    }

    #[cfg(target_os = "android")]
    pub fn update_prayer_times(&self, args: UpdatePrayerTimesArgs) -> Result<()> {
        self.0
            .run_mobile_plugin("updatePrayerTimes", args)
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(not(target_os = "android"))]
    pub fn update_prayer_times(&self, _args: UpdatePrayerTimesArgs) -> Result<()> {
        Err(Error::PlatformNotSupported)
    }

    #[cfg(target_os = "android")]
    pub fn is_service_running(&self) -> Result<ServiceStatus> {
        self.0
            .run_mobile_plugin("isServiceRunning", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(not(target_os = "android"))]
    pub fn is_service_running(&self) -> Result<ServiceStatus> {
        Ok(ServiceStatus { is_running: false })
    }

    #[cfg(target_os = "android")]
    pub fn check_notification_permission(&self) -> Result<NotificationPermissionStatus> {
        self.0
            .run_mobile_plugin("checkNotificationPermission", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(not(target_os = "android"))]
    pub fn check_notification_permission(&self) -> Result<NotificationPermissionStatus> {
        // On non-Android platforms, permission is always granted
        Ok(NotificationPermissionStatus {
            granted: true,
            can_request: false,
        })
    }

    #[cfg(target_os = "android")]
    pub fn request_notification_permission(&self) -> Result<PermissionResult> {
        self.0
            .run_mobile_plugin("requestNotificationPermission", ())
            .map_err(|e| Error::PluginInvoke(e.to_string()))
    }

    #[cfg(not(target_os = "android"))]
    pub fn request_notification_permission(&self) -> Result<PermissionResult> {
        // On non-Android platforms, permission is always granted
        Ok(PermissionResult { granted: true })
    }
}

#[cfg(target_os = "android")]
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<PrayerService<R>> {
    let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "PrayerServicePlugin")?;
    Ok(PrayerService(handle))
}

#[cfg(not(target_os = "android"))]
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> Result<PrayerService<R>> {
    Ok(PrayerService(std::marker::PhantomData))
}
