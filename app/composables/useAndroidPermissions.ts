import { invoke } from "@tauri-apps/api/core";
import { getPlatform } from "@/utils/platform";

// Module-level so the Settings section shows the last known answers while the
// dialog is closed and reopened.
const notificationPermissionGranted = ref(false);
const batteryOptimizationDisabled = ref(false);
const isCheckingPermissions = ref(false);

/** Android: the notification and battery permissions prayer alerts depend on. */
export function useAndroidPermissions() {
  async function checkPermissions() {
    if (getPlatform() !== 'android') return;

    isCheckingPermissions.value = true;
    try {
      const [notifResult, batteryResult] = await Promise.all([
        invoke<{ granted: boolean }>('plugin:prayer-service|check_notification_permission'),
        invoke<{ isIgnoring: boolean }>('plugin:prayer-service|check_battery_optimization'),
      ]);

      notificationPermissionGranted.value = notifResult.granted;
      batteryOptimizationDisabled.value = batteryResult.isIgnoring;
    } catch (e) {
      console.error('Failed to check permissions:', e);
    } finally {
      isCheckingPermissions.value = false;
    }
  }

  async function requestNotificationPermission() {
    try {
      await invoke('plugin:prayer-service|request_notification_permission');
      // Re-check after user returns from settings
      setTimeout(() => checkPermissions(), 1000);
    } catch (e) {
      console.error('Failed to request notification permission:', e);
    }
  }

  async function requestBatteryExemption() {
    try {
      await invoke('plugin:prayer-service|request_battery_optimization_exemption');
      // Re-check after user returns from settings
      setTimeout(() => checkPermissions(), 1000);
    } catch (e) {
      console.error('Failed to request battery exemption:', e);
    }
  }

  async function openSettings() {
    try {
      await invoke('plugin:prayer-service|open_app_settings');
    } catch (e) {
      console.error('Failed to open settings:', e);
    }
  }

  return {
    notificationPermissionGranted,
    batteryOptimizationDisabled,
    isCheckingPermissions,
    checkPermissions,
    requestNotificationPermission,
    requestBatteryExemption,
    openSettings,
  };
}
