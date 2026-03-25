import {
  computePreviousPrayerInfo,
  getDateKey,
  getTimeDiff,
  formatTimeDiff,
  resetToMidnight,
  getUserTimezone,
  buildCurrentTimeRefs,
} from "@/utils/time";
import {
  PRAYER_ORDER,
  ADDITIONAL_PRAYER_KEYS_SET,
  PRAYER_DESCRIPTIONS,
  ISLAMIC_MONTHS,
} from "@/constants/prayers";
import type { PrayerTimingItem } from "@/utils/types";
import {
  toCalendar,
  CalendarDate,
  IslamicUmalquraCalendar,
} from "@internationalized/date";

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

function parseTimeToMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const minutes = Number(ampmMatch[2]);
    const isPM = ampmMatch[3]?.toUpperCase() === "PM";
    if (hours === 12) hours = 0;
    return (isPM ? hours + 12 : hours) * 60 + minutes;
  }
  const parts = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (!parts) return null;
  const h = Number(parts[1]);
  const m = Number(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function usePrayerDisplay() {
  const state = usePrayerState();
  const { getNow } = useMockTime();

  const now = ref<Date>(getNow());
  let intervalId: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    intervalId = setInterval(() => {
      now.value = getNow();
    }, 1000);
  });

  onBeforeUnmount(() => {
    if (intervalId) clearInterval(intervalId);
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
    try {
      const { year, month, day } = todayDate.value;
      const gregorianDate = new CalendarDate(year, month, day);
      const islamicDate = toCalendar(
        gregorianDate,
        new IslamicUmalquraCalendar(),
      );
      const monthName =
        ISLAMIC_MONTHS[islamicDate.month - 1] || `Month ${islamicDate.month}`;
      return `${islamicDate.day} ${monthName} ${islamicDate.year} AH`;
    } catch (e) {
      console.error("[usePrayerDisplay] Failed to format Hijri date:", e);
      return null;
    }
  });

  const gregorianDateVerbose = computed<string | null>(() => {
    try {
      const { year, month, day } = todayDate.value;
      return new Intl.DateTimeFormat("en-US", {
        calendar: "gregory",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(year, month - 1, day));
    } catch {
      return null;
    }
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

  const timingsList = computed<PrayerTimingItem[]>(() => {
    const list = baseTimingsList.value;
    if (list.length === 0) return [];

    const nowS = nowSecondsOfDay.value;
    let nextIndex = list.findIndex(
      (t) =>
        typeof t.minutes === "number" && (t.minutes as number) * 60 > nowS,
    );
    if (nextIndex === -1) nextIndex = 0;

    return list.map((t, idx) => ({
      ...t,
      isPast:
        typeof t.minutes === "number"
          ? idx !== nextIndex &&
            ((idx < nextIndex && nextIndex !== 0) ||
              (nextIndex === 0 && (t.minutes as number) * 60 < nowS))
          : false,
      isNext: idx === nextIndex,
    }));
  });

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
