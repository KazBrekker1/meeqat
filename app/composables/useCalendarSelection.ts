import { GregorianCalendar, toCalendar } from "@internationalized/date";
import { PRAYER_ORDER } from "@/constants/prayers";
import { formatGregorianVerbose } from "@/utils/format";
import { pad2, parseTimeToMinutes } from "@/utils/time";

/**
 * The home page's calendar: the dual Hijri/Gregorian state (shared by the mini
 * calendar and the calendar drawer) plus the prayer times of the date picked in it.
 */
export function useCalendarSelection() {
  const {
    fetchSelectedDay,
    selectedDay,
    todayDateKey,
    prefsLoaded,
    selectedMethodId,
    selectedCity,
    selectedCountry,
    locationMode,
    gpsLat,
    gpsLng,
    timeFormat,
  } = usePrayerRuntime();

  // Dual Hijri/Gregorian calendar state + formatting (shared composable).
  const calendar = useHijriCalendar(todayDateKey);
  const { calendarDate } = calendar;

  // --- Times for a date picked in the calendar ---
  // They live in their own state and their own block: "Today's prayers", the
  // countdown, orbit, tray, widget and notifications always stay on today.
  const selectedDateKey = computed(() => {
    const greg = toCalendar(calendarDate.value, new GregorianCalendar());
    return `${greg.year}-${pad2(greg.month)}-${pad2(greg.day)}`;
  });
  watch(
    [selectedDateKey, todayDateKey, prefsLoaded, selectedMethodId, locationMode, selectedCity, selectedCountry, gpsLat, gpsLng],
    () => void fetchSelectedDay(selectedDateKey.value),
    { immediate: true },
  );
  const selectedDayTimes = computed(() => {
    const day = selectedDay.value;
    if (!day || day.dateKey !== selectedDateKey.value) return [];
    return PRAYER_ORDER.flatMap(([key, label]) => {
      const minutes = parseTimeToMinutes(day.timings[key]);
      if (minutes == null) return [];
      return [{ key, label, time: formatMinutesLocal(minutes, timeFormat.value === "24h") }];
    });
  });
  const selectedDayLabel = computed(() => {
    const greg = toCalendar(calendarDate.value, new GregorianCalendar());
    return formatGregorianVerbose(new Date(greg.year, greg.month - 1, greg.day)) ?? "";
  });

  return { ...calendar, selectedDayTimes, selectedDayLabel };
}
