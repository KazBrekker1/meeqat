import type { PrayerTimingItem } from "@/utils/types";
import type { Ref } from "vue";
import type { UpcomingDay } from "@/composables/prayer/usePrayerFetch";
import { invoke } from "@tauri-apps/api/core";
import { getPlatform } from "@/utils/platform";
import { getDateKey } from "@/utils/time";

// How many days (today included) the widget is given, so it can roll over to the
// next day by itself while the app stays closed.
const UPCOMING_DAYS = 7;

interface PrayerTimeData {
  prayerName: string;
  prayerTime: number; // Unix timestamp in milliseconds
  label: string;
}

/** One day of the widget's look-ahead window (same shapes as the top-level fields). */
interface UpcomingDayData {
  prayers: PrayerTimeData[];
  hijriDate?: string;
  gregorianDate?: string;
}

interface UpdatePrayerTimesOptions extends Record<string, unknown> {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
  hijriDate?: string;
  gregorianDate?: string;
  nextDayPrayerName?: string;
  nextDayPrayerTime?: number;
  nextDayPrayerLabel?: string;
  city?: string;
  countryCode?: string;
  use24Hour?: boolean;
  /** Ascending, starting with today, consecutive days only. */
  upcomingDays?: UpcomingDayData[];
}

// Update widget data (this is what startService does now - just saves data)
function updatePrayerTimes(options: UpdatePrayerTimesOptions): Promise<void> {
  return invoke("plugin:prayer-service|update_prayer_times", options);
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
  /** The app's 12h/24h setting, so the widget's clock times match the app. */
  is24Hour?: Ref<boolean>;
  /** Resolves tomorrow's first prayer at its real time (from cached calendar). */
  getNextDayPrayer?: () => Promise<{
    prayerName: string;
    prayerTime: number;
    label: string;
  } | null>;
  /** Resolves the cached days from today on, for the given times (real per-day times). */
  getUpcomingDays?: (
    days: number,
    wanted: readonly { key: string; label: string }[],
  ) => Promise<UpcomingDay[]>;
  /** The same date strings as `hijriDate`/`gregorianDate`, for another day. */
  formatDates?: (date: Date) => { hijriDate?: string; gregorianDate?: string };
  /** Changes when the cached days behind `getUpcomingDays` change. */
  dataVersion?: Ref<number>;
}) {
  const {
    timingsList,
    hijriDate,
    gregorianDate,
    city,
    countryCode,
    is24Hour,
    getNextDayPrayer,
    getUpcomingDays,
    formatDates,
    dataVersion,
  } = options;

  const isAndroid = getPlatform() === "android";

  onMounted(async () => {
    if (isAndroid) {
      console.log("[PrayerService] Android platform detected");

      // If we have timings, update widgets immediately
      if (timingsList.value.length > 0) {
        console.log("[PrayerService] Updating widgets on mount with existing timings");
        await update();
      }
    }
  });

  /**
   * Today (as sent at the top level) followed by the cached days after it. Stops
   * at the first day missing from the cache, so the entries are always consecutive.
   */
  async function buildUpcomingDays(
    today: PrayerTimeData[],
  ): Promise<UpcomingDayData[]> {
    const out: UpcomingDayData[] = [
      {
        prayers: today,
        hijriDate: hijriDate?.value ?? undefined,
        gregorianDate: gregorianDate?.value ?? undefined,
      },
    ];
    if (!getUpcomingDays) return out;

    const wanted = timingsList.value
      .filter((t) => typeof t.minutes === "number")
      .map((t) => ({ key: t.key, label: t.label }));
    let cached: UpcomingDay[] = [];
    try {
      cached = await getUpcomingDays(UPCOMING_DAYS, wanted);
    } catch {
      cached = [];
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 1; i < UPCOMING_DAYS; i++) {
      const date = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + i,
      );
      const day = cached.find((d) => d.dateKey === getDateKey(date));
      if (!day) break;
      out.push({
        prayers: day.prayers
          .map((p) => {
            // Local wall-clock time on that day; setMinutes keeps it DST-correct.
            const prayerTime = new Date(date);
            prayerTime.setMinutes(p.minutes);
            return {
              prayerName: p.key,
              prayerTime: prayerTime.getTime(),
              label: p.label,
            };
          })
          .sort((a, b) => a.prayerTime - b.prayerTime),
        ...formatDates?.(date),
      });
    }
    return out;
  }

  // Updates overlap when two changes land close together; only the latest is sent.
  let updateSeq = 0;

  /**
   * Update widget data. Call this whenever prayer times change.
   */
  async function update(): Promise<void> {
    if (!isAndroid) {
      return;
    }

    if (!timingsList.value.length) {
      return;
    }

    const seq = ++updateSeq;
    try {
      const prayers = convertTimingsToServiceData(timingsList.value);
      const nextPrayerIndex = findNextPrayerIndex(timingsList.value);

      // Compute next-day first prayer if all today's prayers have passed
      // After Isha, prefer tomorrow's REAL first prayer (from cached calendar);
      // fall back to today's Fajr + 24h only on a cache miss.
      const fallbackNextDay = computeNextDayFirstPrayer(prayers);
      const nextDay = fallbackNextDay
        ? ((await getNextDayPrayer?.()) ?? fallbackNextDay)
        : null;
      const upcomingDays = await buildUpcomingDays(prayers);
      if (seq !== updateSeq) return;

      await updatePrayerTimes({
        prayers,
        nextPrayerIndex,
        hijriDate: hijriDate?.value ?? undefined,
        gregorianDate: gregorianDate?.value ?? undefined,
        city: city?.value ?? undefined,
        countryCode: countryCode?.value ?? undefined,
        use24Hour: is24Hour?.value,
        ...(nextDay && {
          nextDayPrayerName: nextDay.prayerName,
          nextDayPrayerTime: nextDay.prayerTime,
          nextDayPrayerLabel: nextDay.label,
        }),
        upcomingDays,
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
    [prayerDataKey, hijriDate, gregorianDate, city, countryCode, is24Hour, () => dataVersion?.value],
    async () => {
      if (!isAndroid || !timingsList.value.length) return;
      await update();
    }
  );

  return {
    update,
  };
}
