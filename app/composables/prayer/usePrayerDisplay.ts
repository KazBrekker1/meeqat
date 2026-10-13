import {
  computePreviousPrayerInfo,
  getDateKey,
  getTimeDiff,
  formatTimeDiff,
  resetToMidnight,
  getUserTimezone,
  buildCurrentTimeRefs,
  parseTimeToMinutes,
} from "@/utils/time";
import { indexOfNextToday, flagPrayers } from "@/utils/prayerClock";
import { formatHijriVerbose } from "@/utils/hijri";
import {
  PRAYER_ORDER,
  ADDITIONAL_PRAYER_KEYS_SET,
  PRAYER_DESCRIPTIONS,
} from "@/constants/prayers";
import type { PrayerTimingItem } from "@/utils/types";

const EXTENDED_ORDER: [string, string][] = [
  ["Imsak", "Imsak"],
  ["Fajr", "Fajr"],
  ["Sunrise", "Sunrise"],
  ["Dhuhr", "Dhuhr"],
  ["Asr", "Asr"],
  ["Maghrib", "Maghrib"],
  ["Isha", "Isha"],
  ["Midnight", "Midnight"],
  ["Firstthird", "First Third"],
  ["Lastthird", "Last Third"],
];

export function usePrayerDisplay() {
  const state = usePrayerState();
  const { getNow } = useMockTime();

  const now = ref<Date>(getNow());
  let intervalId: ReturnType<typeof setInterval> | null = null;

  // The 1s interval is throttled/paused by the OS while the window is hidden or
  // backgrounded, so `now` (and everything derived from it — the next-prayer
  // pointer, the midnight-rollover refetch, the tray push) freezes. Resync the
  // moment the app becomes visible/focused again so times correct instantly
  // instead of waiting on a throttled tick.
  const resync = () => {
    now.value = getNow();
  };
  const onVisible = () => {
    if (typeof document === "undefined" || !document.hidden) resync();
  };

  onMounted(() => {
    intervalId = setInterval(() => {
      now.value = getNow();
    }, 1000);
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", onVisible);
    if (typeof window !== "undefined") window.addEventListener("focus", resync);
  });

  onBeforeUnmount(() => {
    if (intervalId) clearInterval(intervalId);
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", onVisible);
    if (typeof window !== "undefined") window.removeEventListener("focus", resync);
  });

  const todayDateKey = computed(() => getDateKey(now.value));

  const currentTimeString = computed(() =>
    formatTime(now.value, state.is24Hour, undefined, true),
  );

  const todayDate = computed(() => {
    const d = now.value;
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    };
  });

  const hijriDateVerbose = computed<string | null>(() => {
    const { year, month, day } = todayDate.value;
    return formatHijriVerbose(new Date(year, month - 1, day));
  });

  const gregorianDateVerbose = computed<string | null>(() => {
    const { year, month, day } = todayDate.value;
    return formatGregorianVerbose(new Date(year, month - 1, day));
  });

  // Timezone never changes during a session — no need for reactivity
  const userTimezone = getUserTimezone();

  function computeAltTimeForTimezone(
    timeStr: string,
    targetTz: string | null,
  ): string | undefined {
    if (!targetTz) return undefined;
    if (targetTz === userTimezone) return undefined;
    const mins = parseTimeToMinutes(timeStr);
    if (mins == null) return undefined;
    // Use a fresh midnight Date to avoid reactive dependency on `now`
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setMinutes(mins);
    return formatDateInTimezone(base, state.is24Hour, targetTz);
  }

  // Only recomputes when timings or settings change (not every second)
  const baseTimingsList = computed<
    Omit<PrayerTimingItem, "isPast" | "isNext">[]
  >(() => {
    if (!state.timings.value) return [];

    const orderToUse = state.showAdditionalTimes.value
      ? EXTENDED_ORDER
      : PRAYER_ORDER;

    return orderToUse
      .filter(([key]) => Boolean(state.timings.value?.[key]))
      .map(([key, label]) => {
        const timeStr = (state.timings.value?.[key] ?? "") as string;
        const minutes = parseTimeToMinutes(timeStr) ?? undefined;
        const display =
          typeof minutes === "number"
            ? formatMinutesLocal(minutes, state.is24Hour)
            : timeStr;
        const description = PRAYER_DESCRIPTIONS[key] || undefined;
        const isAdditional = ADDITIONAL_PRAYER_KEYS_SET.has(key);
        return {
          key,
          label,
          time: display,
          minutes,
          altTime: computeAltTimeForTimezone(
            timeStr,
            state.selectedExtraTimezone.value,
          ),
          description,
          isAdditional,
        };
      })
      .sort((a, b) => {
        if (typeof a.minutes !== "number") return 1;
        if (typeof b.minutes !== "number") return -1;
        return a.minutes - b.minutes;
      });
  });

  const { nowSecondsOfDay } = buildCurrentTimeRefs(now);

  // Index of the next time today, or -1 once the last one has passed. A number,
  // so although it is re-evaluated every second, everything built on it (the
  // list below, and through it the tray, widget, orbit and notifications) only
  // recomputes when a prayer time is crossed.
  const nextIndexToday = computed(() =>
    indexOfNextToday(baseTimingsList.value, nowSecondsOfDay.value),
  );

  const timingsList = computed<PrayerTimingItem[]>(() =>
    flagPrayers(baseTimingsList.value, nextIndexToday.value),
  );

  // Single lookup for the next prayer — avoids 3x .find() per second
  const nextPrayerItem = computed(
    () => timingsList.value.find((t) => t.isNext) ?? null,
  );

  const upcomingKey = computed(() => nextPrayerItem.value?.key ?? null);

  const nextPrayerLabel = computed<string | null>(
    () => nextPrayerItem.value?.label ?? null,
  );

  const countdownToNext = computed<string | null>(() => {
    const next = nextPrayerItem.value;
    if (!next || typeof next.minutes !== "number") return null;
    const target = resetToMidnight(now.value);
    target.setMinutes(next.minutes as number, 0, 0);
    if (target.getTime() <= now.value.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return formatTimeDiff(getTimeDiff(now.value, target));
  });

  const previousPrayerInfo = computed(() =>
    computePreviousPrayerInfo(timingsList.value, now.value),
  );

  const previousPrayerLabel = computed<string | null>(
    () => previousPrayerInfo.value?.label ?? null,
  );

  const timeSincePrevious = computed<string | null>(
    () => previousPrayerInfo.value?.timeSince ?? null,
  );

  return {
    now,
    todayDateKey,
    currentTimeString,
    hijriDateVerbose,
    gregorianDateVerbose,
    timingsList,
    upcomingKey,
    userTimezone,
    nextPrayerLabel,
    countdownToNext,
    previousPrayerLabel,
    timeSincePrevious,
  };
}
