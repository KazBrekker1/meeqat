import type { PrayerTimingItem } from "@/utils/types";
import type { Ref } from "vue";

interface PrayerTimeData {
  prayerName: string;
  prayerTime: number; // Unix timestamp in milliseconds
  label: string;
}

interface UpdatePrayerTimesOptions {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
  hijriDate?: string;
  gregorianDate?: string;
}

// Dynamic imports to avoid issues on non-Android platforms
async function getPluginApi() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return {
      // Update widget data (this is what startService does now - just saves data)
      updatePrayerTimes: (options: UpdatePrayerTimesOptions): Promise<void> => {
        return invoke("plugin:prayer-service|update_prayer_times", options);
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

/**
 * Composable for updating Android home screen widgets with prayer times.
 * This is a simplified version - no foreground service, just widget updates.
 */
export function usePrayerService(options: {
  timingsList: Ref<PrayerTimingItem[]>;
  hijriDate?: Ref<string | null>;
  gregorianDate?: Ref<string | null>;
}) {
  const { timingsList, hijriDate, gregorianDate } = options;

  const isAndroid = ref(false);

  // Check if we're on Android
  onMounted(async () => {
    isAndroid.value = await isAndroidPlatform();

    if (isAndroid.value) {
      console.log("[PrayerService] Android platform detected");

      // If we have timings, update widgets immediately
      if (timingsList.value.length > 0) {
        console.log("[PrayerService] Updating widgets on mount with existing timings");
        await update();
      }
    }
  });

  /**
   * Update widget data. Call this whenever prayer times change.
   */
  async function update(): Promise<void> {
    if (!isAndroid.value) {
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
        hijriDate: hijriDate?.value ?? undefined,
        gregorianDate: gregorianDate?.value ?? undefined,
      });

      console.log("[PrayerService] Widget data updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[PrayerService] Failed to update widget data:", message);
    }
  }

  // Watch for timings changes and update widgets
  watch(
    timingsList,
    async (newTimings) => {
      if (!isAndroid.value) return;

      if (newTimings.length) {
        await update();
      }
    },
    { deep: true }
  );

  // Also watch for when isAndroid becomes true
  watch(
    isAndroid,
    async (isNowAndroid) => {
      if (isNowAndroid && timingsList.value.length) {
        console.log("[PrayerService] Android detected, updating widgets with existing timings");
        await update();
      }
    }
  );

  return {
    isAndroid,
    update,
  };
}
