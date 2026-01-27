use serde::de::DeserializeOwned;
use tauri::{
    plugin::PluginApi,
    AppHandle, Runtime,
};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;

use crate::models::{ServiceStatus, StartServiceArgs, UpdatePrayerTimesArgs, NotificationPermissionStatus, BatteryOptimizationStatus, SetMockTimeOffsetArgs, MockTimeOffsetResult};
use crate::error::{Error, Result};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.meeqat.plugin.prayerservice";

/// Macro to define platform-dispatched methods.
/// On Android, calls the Kotlin plugin method.
/// On other platforms, returns PlatformNotSupported or a default value.
macro_rules! platform_method {
    // With args, no return value (returns Result<()>)
    ($method:ident, $kotlin_name:expr, $args_type:ty) => {
        #[cfg(target_os = "android")]
        pub fn $method(&self, args: $args_type) -> Result<()> {
            self.0
                .run_mobile_plugin($kotlin_name, args)
                .map_err(|e| Error::PluginInvoke(e.to_string()))
        }

        #[cfg(not(target_os = "android"))]
        pub fn $method(&self, _args: $args_type) -> Result<()> {
            Err(Error::PlatformNotSupported)
        }
    };
    // No args, no return value
    ($method:ident, $kotlin_name:expr) => {
        #[cfg(target_os = "android")]
        pub fn $method(&self) -> Result<()> {
            self.0
                .run_mobile_plugin::<()>($kotlin_name, ())
                .map_err(|e| Error::PluginInvoke(e.to_string()))
        }

        #[cfg(not(target_os = "android"))]
        pub fn $method(&self) -> Result<()> {
            Err(Error::PlatformNotSupported)
        }
    };
    // No args, with typed return value and non-android default
    ($method:ident, $kotlin_name:expr => $ret:ty, $default:expr) => {
        #[cfg(target_os = "android")]
        pub fn $method(&self) -> Result<$ret> {
            self.0
                .run_mobile_plugin($kotlin_name, ())
                .map_err(|e| Error::PluginInvoke(e.to_string()))
        }

        #[cfg(not(target_os = "android"))]
        pub fn $method(&self) -> Result<$ret> {
            Ok($default)
        }
    };
}

/// Access to the prayer service APIs.
#[cfg(target_os = "android")]
pub struct PrayerService<R: Runtime>(PluginHandle<R>);

#[cfg(not(target_os = "android"))]
pub struct PrayerService<R: Runtime>(std::marker::PhantomData<fn() -> R>);

impl<R: Runtime> PrayerService<R> {
    platform_method!(start_service, "startService", StartServiceArgs);
    platform_method!(stop_service, "stopService");
    platform_method!(update_prayer_times, "updatePrayerTimes", UpdatePrayerTimesArgs);
    platform_method!(is_service_running, "isServiceRunning" => ServiceStatus, ServiceStatus { is_running: false });
    platform_method!(open_app_settings, "openAppSettings");
    platform_method!(check_notification_permission, "checkNotificationPermission" => NotificationPermissionStatus, NotificationPermissionStatus { granted: true });
    platform_method!(request_notification_permission, "requestNotificationPermission");
    platform_method!(check_battery_optimization, "checkBatteryOptimization" => BatteryOptimizationStatus, BatteryOptimizationStatus { is_ignoring: true });
    platform_method!(request_battery_optimization_exemption, "requestBatteryOptimizationExemption");
    platform_method!(set_mock_time_offset, "setMockTimeOffset", SetMockTimeOffsetArgs);
    platform_method!(get_mock_time_offset, "getMockTimeOffset" => MockTimeOffsetResult, MockTimeOffsetResult { offset_ms: 0 });
    platform_method!(clear_mock_time_offset, "clearMockTimeOffset");
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
