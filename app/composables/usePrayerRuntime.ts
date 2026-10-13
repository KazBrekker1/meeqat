import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { watchDebounced, watchThrottled } from "@vueuse/core";
import { getCityCoordinates, getCityTimezone } from "@/constants/cities";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { moonPhase as lunarPhase } from "@/utils/moon/lunar";
import { formatGregorianVerbose } from "@/utils/format";
import { formatHijriVerbose } from "@/utils/hijri";
import { getPlatform } from "@/utils/platform";
import {
  pad2,
  getSecondsOfDay,
  getUtcOffsetMinutes,
  formatUtcOffset,
} from "@/utils/time";
import type { TrayUpdatePayload } from "@/utils/types";

function createPrayerRuntime() {
  const prayer = usePrayerTimes();
  const { getNow } = useMockTime();
  const {
    timingsList,
    selectedMethodId,
    selectedCity,
    selectedCountry,
    locationMode,
    gpsLat,
    gpsLng,
    gpsCity,
    hijriDateVerbose,
    gregorianDateVerbose,
    nextPrayerLabel,
    countdownToNext,
    previousPrayerLabel,
    timeSincePrevious,
  } = prayer;

  // A place is chosen (city, or picked coordinates). False on first run.
  const hasLocation = computed(() =>
    locationMode.value === "gps"
      ? gpsLat.value != null && gpsLng.value != null
      : !!selectedCity.value && !!selectedCountry.value,
  );

  // Active coordinates for the Qibla compass: GPS position in GPS mode, otherwise
  // the selected city's coordinates from the curated list.
  const activeCoords = computed<{ lat: number; lng: number } | null>(() => {
    if (locationMode.value === "gps") {
      return gpsLat.value != null && gpsLng.value != null
        ? { lat: gpsLat.value, lng: gpsLng.value }
        : null;
    }
    if (selectedCity.value && selectedCountry.value) {
      return getCityCoordinates(selectedCountry.value, selectedCity.value) ?? null;
    }
    return null;
  });

  // City label for the "add to calendar" feed and the widget: the curated city
  // name, or the reverse-geocoded GPS label when available.
  const locationDisplayName = computed(() =>
    locationMode.value === "gps" ? gpsCity.value : selectedCity.value,
  );

  // Current time as 24h HH:MM for the orbit's "now" position (ticks each second,
  // changes each minute).
  const nowHHMM = computed(() => {
    void countdownToNext.value;
    const m = Math.floor(getSecondsOfDay(getNow()) / 60);
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  });

  // Real moon phase for the current moment (mock-time aware), once a minute.
  const moonPhase = computed(() => {
    void nowHHMM.value;
    return lunarPhase(getNow());
  });

  // Times are requested in the device's timezone. When a curated city sits at a
  // different UTC offset, say so; a picked point has no known timezone → no note.
  const timezoneNote = computed<string | null>(() => {
    void prayer.todayDateKey.value; // offsets move with daylight saving
    if (locationMode.value === "gps") return null;
    const tz = getCityTimezone(selectedCountry.value, selectedCity.value);
    if (!tz) return null;
    const at = getNow();
    const place = getUtcOffsetMinutes(tz, at);
    const device = -at.getTimezoneOffset();
    if (place == null || place === device) return null;
    return `In your device's time (${formatUtcOffset(device)}), not ${selectedCity.value}'s (${formatUtcOffset(place)})`;
  });

  // Start notifications scheduler with custom settings
  const { startPrayerNotifications, send, settings: notificationSettings } =
    useNotifications({
      timingsList,
      getUpcomingDays: prayer.getUpcomingDays,
      dataVersion: prayer.cacheVersion,
    });

  // Update Android home screen widgets
  const { isAndroid } = usePrayerService({
    timingsList,
    hijriDate: hijriDateVerbose,
    gregorianDate: gregorianDateVerbose,
    city: computed(() => locationDisplayName.value || null),
    countryCode: computed(() =>
      locationMode.value === "gps" ? null : selectedCountry.value || null,
    ),
    is24Hour: prayer.is24Hour,
    getNextDayPrayer: prayer.getNextDayFirstPrayer,
    getUpcomingDays: prayer.getUpcomingDays,
    formatDates: (date) => ({
      hijriDate: formatHijriVerbose(date) ?? undefined,
      gregorianDate: formatGregorianVerbose(date) ?? undefined,
    }),
    dataVersion: prayer.cacheVersion,
  });

  // Saved preferences are in: only after this do changes to them count as the
  // user's (the saved method loading must not trigger a second fetch).
  const prefsLoaded = shallowRef(false);

  onMounted(async () => {
    await prayer.loadPreferences();
    // Let the watchers woken by the loaded values run first.
    await nextTick();
    prefsLoaded.value = true;
    void prayer.refetchToday();
    void startPrayerNotifications();
  });

  watch(selectedMethodId, () => {
    if (!prefsLoaded.value) return;
    prayer.clearTimings();
    void prayer.refetchToday();
  });

  // The tray icon and popover exist on desktop only.
  if (getPlatform() === "desktop") {
    // Tray title + countdown update — throttle 1s (countdown changes every second)
    watchThrottled(
      [nextPrayerLabel, countdownToNext, previousPrayerLabel, timeSincePrevious],
      async () => {
        try {
          const titleCountdown = (countdownToNext.value ?? "")
            .split(":")
            .slice(0, 2)
            .join(":");
          const title =
            nextPrayerLabel.value && titleCountdown
              ? `${nextPrayerLabel.value} in ${titleCountdown}`
              : null;

          await emit("meeqat:tray:update", {
            title,
            moonPhase: moonPhase.value,
            now: nowHHMM.value,
            nextPrayerLabel: nextPrayerLabel.value,
            countdown: countdownToNext.value,
            sincePrayerLabel: previousPrayerLabel.value ?? "",
            sinceTime: timeSincePrevious.value ?? "",
          } satisfies TrayUpdatePayload);
        } catch {
          // ignore emit errors
        }
      },
      { throttle: 1000 },
    );

    // Tray full data update. Debounced, not throttled: a 30s throttle held back the
    // snapshot with the prayer times, leaving the tray on a bare moon for up to 30s.
    // `timingsList` only changes with the data or at a prayer boundary, so this
    // does not run every second.
    watchDebounced(
      [
        gregorianDateVerbose,
        hijriDateVerbose,
        timingsList,
        () => locationMode.value === "gps" ? (gpsCity.value ?? "GPS") : selectedCity.value,
        () => locationMode.value === "gps" ? "" : selectedCountry.value,
        activeCoords,
        timezoneNote,
      ],
      async () => {
        try {
          const dateLineParts: string[] = [];
          if (hijriDateVerbose.value)
            dateLineParts.push(`Hijri: ${hijriDateVerbose.value}`);
          if (gregorianDateVerbose.value)
            dateLineParts.push(`Gregorian: ${gregorianDateVerbose.value}`);
          const dateLine = dateLineParts.join(" | ");

          const list = (timingsList.value || [])
            .filter(
              (t) =>
                typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key),
            )
            .sort((a, b) => a.minutes! - b.minutes!);
          // Times not loaded yet: wait for them rather than sending the tray an empty list.
          if (!list.length) return;

          let nextLine = "Next: --";
          if (nextPrayerLabel.value && countdownToNext.value) {
            nextLine = `${nextPrayerLabel.value} in \t\t ${countdownToNext.value}`;
          }

          let sinceLine = "Last: --";
          if (previousPrayerLabel.value && timeSincePrevious.value) {
            sinceLine = `${previousPrayerLabel.value} since \t ${timeSincePrevious.value}`;
          }

          // Rust keeps this snapshot and hands it to the tray popover on load, so the
          // popover never depends on having caught a one-off event.
          await invoke("set_tray_snapshot", { payload: {
            dateLine,
            nextLine,
            sinceLine,
            hijriDate: hijriDateVerbose.value,
            gregorianDate: gregorianDateVerbose.value,
            nextPrayerLabel: nextPrayerLabel.value,
            countdown: countdownToNext.value,
            sincePrayerLabel: previousPrayerLabel.value ?? "",
            sinceTime: timeSincePrevious.value ?? "",
            timingsList: list,
            city:
              locationMode.value === "gps"
                ? (gpsCity.value ?? "GPS")
                : selectedCity.value,
            countryCode:
              locationMode.value === "gps" ? "" : selectedCountry.value,
            // The tray draws the Moon as seen from here.
            lat: activeCoords.value?.lat ?? null,
            lng: activeCoords.value?.lng ?? null,
            timezoneNote: timezoneNote.value,
          } satisfies TrayUpdatePayload });
        } catch {
          // ignore invoke errors
        }
      },
      { debounce: 250 },
    );
  }

  return {
    ...prayer,
    hasLocation,
    activeCoords,
    locationDisplayName,
    nowHHMM,
    moonPhase,
    timezoneNote,
    prefsLoaded,
    send,
    notificationSettings,
    isAndroid,
  };
}

let runtime: ReturnType<typeof createPrayerRuntime> | undefined;

/**
 * The main window's one prayer-times engine: today's times, the notification
 * schedule, the tray title/snapshot and the Android widget push.
 *
 * Created by app.vue's setup, so it runs on every route (Rooms, Privacy, a deep
 * link…) for as long as the app does, and nothing is cancelled when the home
 * page unmounts. Pages call this to read the same state.
 */
export function usePrayerRuntime() {
  return (runtime ??= createPrayerRuntime());
}
