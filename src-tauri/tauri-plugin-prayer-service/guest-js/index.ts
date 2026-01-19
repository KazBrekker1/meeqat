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
