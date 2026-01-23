import { invoke } from "@tauri-apps/api/core";

export interface PrayerTimeData {
  prayerName: string;
  prayerTime: number; // Unix timestamp in milliseconds
  label: string;
}

export interface UpdatePrayerTimesOptions {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
  hijriDate?: string;
  gregorianDate?: string;
}

/**
 * Updates the prayer times data for home screen widgets.
 * This saves the data to SharedPreferences and triggers a widget refresh.
 * @param options - The prayer times and next prayer index
 */
export async function updatePrayerTimes(
  options: UpdatePrayerTimesOptions
): Promise<void> {
  return invoke("plugin:prayer-service|update_prayer_times", options);
}

/**
 * Open the app's system settings page where users can manage permissions
 */
export async function openAppSettings(): Promise<void> {
  return invoke("plugin:prayer-service|open_app_settings");
}

export interface NotificationPermissionStatus {
  granted: boolean;
}

export interface BatteryOptimizationStatus {
  isIgnoring: boolean;
}

/**
 * Check if notification permission is granted
 */
export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  return invoke("plugin:prayer-service|check_notification_permission");
}

/**
 * Request notification permission (opens settings on Android 13+)
 */
export async function requestNotificationPermission(): Promise<void> {
  return invoke("plugin:prayer-service|request_notification_permission");
}

/**
 * Check if battery optimization is disabled for this app
 */
export async function checkBatteryOptimization(): Promise<BatteryOptimizationStatus> {
  return invoke("plugin:prayer-service|check_battery_optimization");
}

/**
 * Request battery optimization exemption
 */
export async function requestBatteryOptimizationExemption(): Promise<void> {
  return invoke("plugin:prayer-service|request_battery_optimization_exemption");
}

export interface MockTimeOffsetResult {
  offsetMs: number;
}

/**
 * Set a mock time offset for debugging purposes.
 * Positive values move time forward, negative values move time backward.
 * This affects widget countdown calculations on Android.
 * @param offsetMs - The offset in milliseconds to apply
 */
export async function setMockTimeOffset(offsetMs: number): Promise<void> {
  return invoke("plugin:prayer-service|set_mock_time_offset", { offsetMs });
}

/**
 * Get the current mock time offset.
 * @returns The current offset in milliseconds (0 if no offset is set)
 */
export async function getMockTimeOffset(): Promise<MockTimeOffsetResult> {
  return invoke("plugin:prayer-service|get_mock_time_offset");
}

/**
 * Clear the mock time offset (reset to real time).
 */
export async function clearMockTimeOffset(): Promise<void> {
  return invoke("plugin:prayer-service|clear_mock_time_offset");
}
