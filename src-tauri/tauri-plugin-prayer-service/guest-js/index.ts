import { invoke } from "@tauri-apps/api/core";

export interface PrayerTimeData {
  prayerName: string;
  prayerTime: number; // Unix timestamp in milliseconds
  label: string;
}

export interface StartServiceOptions {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
}

export interface UpdatePrayerTimesOptions {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
}

export interface ServiceStatus {
  isRunning: boolean;
}

export interface NotificationPermissionStatus {
  granted: boolean;
  canRequest: boolean;
}

export interface PermissionResult {
  granted: boolean;
}

export interface BatteryOptimizationStatus {
  isIgnoringBatteryOptimizations: boolean;
  canRequest: boolean;
}

export interface BatteryOptimizationResult {
  requestSent?: boolean;
  alreadyExempt?: boolean;
  notRequired?: boolean;
}

/**
 * Starts the prayer foreground service with the given prayer times
 * @param options - The prayer times and next prayer index
 */
export async function startPrayerService(
  options: StartServiceOptions
): Promise<void> {
  return invoke("plugin:prayer-service|start_service", { args: options });
}

/**
 * Stops the prayer foreground service
 */
export async function stopPrayerService(): Promise<void> {
  return invoke("plugin:prayer-service|stop_service");
}

/**
 * Updates the prayer times in the running service
 * @param options - The updated prayer times and next prayer index
 */
export async function updatePrayerTimes(
  options: UpdatePrayerTimesOptions
): Promise<void> {
  return invoke("plugin:prayer-service|update_prayer_times", { args: options });
}

/**
 * Checks if the prayer service is currently running
 * @returns The service status
 */
export async function isPrayerServiceRunning(): Promise<ServiceStatus> {
  return invoke("plugin:prayer-service|is_service_running");
}

/**
 * Checks if notification permission is granted
 * @returns The notification permission status
 */
export async function checkNotificationPermission(): Promise<NotificationPermissionStatus> {
  return invoke("plugin:prayer-service|check_notification_permission");
}

/**
 * Requests notification permission from the user
 * @returns The permission result
 */
export async function requestNotificationPermission(): Promise<PermissionResult> {
  return invoke("plugin:prayer-service|request_notification_permission");
}

/**
 * Checks if the app is exempted from battery optimization (Doze mode)
 * When exempted, the app can run background services more reliably
 * @returns The battery optimization status
 */
export async function checkBatteryOptimization(): Promise<BatteryOptimizationStatus> {
  return invoke("plugin:prayer-service|check_battery_optimization");
}

/**
 * Requests the user to disable battery optimization for this app
 * This opens the system settings where the user can whitelist the app
 * @returns The result of the request
 */
export async function requestBatteryOptimizationExemption(): Promise<BatteryOptimizationResult> {
  return invoke("plugin:prayer-service|request_battery_optimization_exemption");
}

/**
 * Opens the app's system settings page where users can manage permissions
 * and battery settings manually
 */
export async function openAppSettings(): Promise<void> {
  return invoke("plugin:prayer-service|open_app_settings");
}
