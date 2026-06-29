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
  nextDayPrayerName?: string;
  nextDayPrayerTime?: number;
  nextDayPrayerLabel?: string;
  city?: string;
  countryCode?: string;
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
 * Compute tomorrow's first prayer (today's first + 24h) as a fallback rollover
 * target for the widget. Returns null only when there's no prayer data.
 *
 * This is computed UNCONDITIONALLY (not just after Isha). The native widget only
 * *uses* it once all of today's prayers have passed (and guards prayerTime > now),
 * but the value must already be stored by then: after Isha the app is usually
 * closed, so update() won't run to provide it. Previously this returned null
 * before Isha, which made savePrayerData wipe the next-day keys during the day —
 * so after Isha the widget had no rollover target and stuck on "Until Isha · Now".
 */
function computeNextDayFirstPrayer(
  prayers: PrayerTimeData[]
): { prayerName: string; prayerTime: number; label: string } | null {
  if (prayers.length === 0) return null;

  // Earliest prayer by timestamp = today's first prayer (Fajr). Shift +24h for
  // tomorrow's. (The caller prefers the real cached-calendar time when available.)
  const sorted = [...prayers].sort((a, b) => a.prayerTime - b.prayerTime);
  const first = sorted[0]!;
  const tomorrowTime = first.prayerTime + 24 * 60 * 60 * 1000;

  return {
    prayerName: first.prayerName,
    prayerTime: tomorrowTime,
    label: first.label,
  };
}

/**
 * Composable for updating Android home screen widgets with prayer times.
 * This is a simplified version - no foreground service, just widget updates.
 */
export function usePrayerService(options: {
  timingsList: Ref<PrayerTimingItem[]>;
  hijriDate?: Ref<string | null>;
  gregorianDate?: Ref<string | null>;
  city?: Ref<string | null>;
  countryCode?: Ref<string | null>;
  /** Resolves tomorrow's first prayer at its real time (from cached calendar). */
  getNextDayPrayer?: () => Promise<{
    prayerName: string;
    prayerTime: number;
    label: string;
  } | null>;
}) {
  const { timingsList, hijriDate, gregorianDate, city, countryCode, getNextDayPrayer } = options;

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

      // Compute next-day first prayer if all today's prayers have passed
      // After Isha, prefer tomorrow's REAL first prayer (from cached calendar);
      // fall back to today's Fajr + 24h only on a cache miss.
      const fallbackNextDay = computeNextDayFirstPrayer(prayers);
      const nextDay = fallbackNextDay
        ? ((await getNextDayPrayer?.()) ?? fallbackNextDay)
        : null;

      await api.updatePrayerTimes({
        prayers,
        nextPrayerIndex,
        hijriDate: hijriDate?.value ?? undefined,
        gregorianDate: gregorianDate?.value ?? undefined,
        city: city?.value ?? undefined,
        countryCode: countryCode?.value ?? undefined,
        ...(nextDay && {
          nextDayPrayerName: nextDay.prayerName,
          nextDayPrayerTime: nextDay.prayerTime,
          nextDayPrayerLabel: nextDay.label,
        }),
      });

      console.log("[PrayerService] Widget data updated");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[PrayerService] Failed to update widget data:", message);
    }
  }

  // Stable key that only changes when actual prayer data changes (new city, new date, settings change)
  // — NOT every second like the old deep watch on timingsList
  const prayerDataKey = computed(() =>
    timingsList.value.map((t) => `${t.key}:${t.minutes}`).join(",")
  );

  // Single watch: fires only when prayer data, dates, or location actually change
  watch(
    [prayerDataKey, hijriDate, gregorianDate, city, countryCode, isAndroid],
    async () => {
      if (!isAndroid.value || !timingsList.value.length) return;
      await update();
    }
  );

  return {
    isAndroid,
    update,
  };
}
