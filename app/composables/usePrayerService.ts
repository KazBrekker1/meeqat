import type { PrayerTimingItem } from "@/utils/types";
import type { Ref } from "vue";

interface PrayerTimeData {
  prayerName: string;
  prayerTime: number; // Unix timestamp in milliseconds
  label: string;
}

interface StartServiceOptions {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
}

interface UpdatePrayerTimesOptions {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
}

interface ServiceStatus {
  isRunning: boolean;
}

// Dynamic imports to avoid issues on non-Android platforms
async function getPluginApi() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return {
      // Pass options directly - Kotlin plugin expects prayers/nextPrayerIndex at top level
      startPrayerService: (options: StartServiceOptions): Promise<void> => {
        return invoke("plugin:prayer-service|start_service", options);
      },
      stopPrayerService: (): Promise<void> => {
        return invoke("plugin:prayer-service|stop_service");
      },
      updatePrayerTimes: (options: UpdatePrayerTimesOptions): Promise<void> => {
        return invoke("plugin:prayer-service|update_prayer_times", options);
      },
      isPrayerServiceRunning: (): Promise<ServiceStatus> => {
        return invoke("plugin:prayer-service|is_service_running");
      },
    };
  } catch {
    return null;
  }
}

async function isAndroidPlatform(): Promise<boolean> {
  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    const p = await platform();
    return p === "android";
  } catch {
    return false;
  }
}

function convertTimingsToServiceData(
  timingsList: PrayerTimingItem[]
): PrayerTimeData[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return timingsList
    .filter((timing) => typeof timing.minutes === "number")
    .map((timing) => {
      const prayerTime = new Date(today);
      prayerTime.setMinutes(timing.minutes!);

      // If the prayer time has passed, set it to tomorrow
      if (prayerTime.getTime() < Date.now()) {
        prayerTime.setDate(prayerTime.getDate() + 1);
      }

      return {
        prayerName: timing.key,
        prayerTime: prayerTime.getTime(),
        label: timing.label,
      };
    });
}

function findNextPrayerIndex(timingsList: PrayerTimingItem[]): number {
  const index = timingsList.findIndex((t) => t.isNext);
  return index >= 0 ? index : 0;
}

export function usePrayerService(options: {
  timingsList: Ref<PrayerTimingItem[]>;
}) {
  const { timingsList } = options;

  const isServiceRunning = ref(false);
  const isAndroid = ref(false);
  const serviceError = ref<string | null>(null);

  // Check if we're on Android and start service if timings available
  onMounted(async () => {
    isAndroid.value = await isAndroidPlatform();

    if (isAndroid.value) {
      console.log("[PrayerService] Android platform detected on mount");

      // Check if service is already running
      const running = await checkStatus();
      console.log("[PrayerService] Service running status:", running);

      // If service not running and we have timings, start it
      if (!running && timingsList.value.length > 0) {
        console.log("[PrayerService] Starting service on mount with existing timings");
        await start();
      }
    }
  });

  async function start(): Promise<void> {
    if (!isAndroid.value) {
      console.log("[PrayerService] Not on Android, skipping service start");
      return;
    }

    if (!timingsList.value.length) {
      console.log("[PrayerService] No timings available, skipping service start");
      return;
    }

    try {
      const api = await getPluginApi();
      if (!api) {
        console.log("[PrayerService] Plugin API not available");
        return;
      }

      const prayers = convertTimingsToServiceData(timingsList.value);
      const nextPrayerIndex = findNextPrayerIndex(timingsList.value);

      console.log("[PrayerService] Starting service with", prayers.length, "prayers, next index:", nextPrayerIndex);
      console.log("[PrayerService] Prayer data:", JSON.stringify(prayers.slice(0, 2)));

      await api.startPrayerService({
        prayers,
        nextPrayerIndex,
      });

      isServiceRunning.value = true;
      serviceError.value = null;
      console.log("[PrayerService] Service started successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[PrayerService] Failed to start service:", message, err);
      serviceError.value = message;
      isServiceRunning.value = false;
    }
  }

  async function stop(): Promise<void> {
    if (!isAndroid.value) {
      return;
    }

    try {
      const api = await getPluginApi();
      if (!api) return;

      await api.stopPrayerService();
      isServiceRunning.value = false;
      serviceError.value = null;
      console.log("[PrayerService] Service stopped");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[PrayerService] Failed to stop service:", message);
      serviceError.value = message;
    }
  }

  async function update(): Promise<void> {
    if (!isAndroid.value || !isServiceRunning.value) {
      return;
    }

    if (!timingsList.value.length) {
      return;
    }

    try {
      const api = await getPluginApi();
      if (!api) return;

      const prayers = convertTimingsToServiceData(timingsList.value);
      const nextPrayerIndex = findNextPrayerIndex(timingsList.value);

      await api.updatePrayerTimes({
        prayers,
        nextPrayerIndex,
      });

      console.log("[PrayerService] Service updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[PrayerService] Failed to update service:", message);
      serviceError.value = message;
    }
  }

  async function checkStatus(): Promise<boolean> {
    if (!isAndroid.value) {
      return false;
    }

    try {
      const api = await getPluginApi();
      if (!api) return false;

      const status = await api.isPrayerServiceRunning();
      isServiceRunning.value = status.isRunning;
      return status.isRunning;
    } catch {
      return false;
    }
  }

  // Watch for timings changes and update the service
  watch(
    timingsList,
    async (newTimings) => {
      if (!isAndroid.value) return;

      if (newTimings.length && !isServiceRunning.value) {
        // Start service if not running and we have timings
        await start();
      } else if (isServiceRunning.value) {
        // Update service with new timings
        await update();
      }
    },
    { deep: true }
  );

  // Also watch for when isAndroid becomes true - start service if timings are available
  watch(
    isAndroid,
    async (isNowAndroid) => {
      if (isNowAndroid && timingsList.value.length && !isServiceRunning.value) {
        console.log("[PrayerService] Android detected, starting service with existing timings");
        await start();
      }
    }
  );

  return {
    isServiceRunning,
    isAndroid,
    serviceError,
    start,
    stop,
    update,
    checkStatus,
  };
}
