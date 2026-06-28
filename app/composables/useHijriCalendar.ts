import {
  DateFormatter,
  getLocalTimeZone,
  GregorianCalendar,
  IslamicUmalquraCalendar,
  toCalendar,
  today,
  type CalendarDate,
  type DateValue,
} from "@internationalized/date";
import { ISLAMIC_MONTHS } from "@/constants/prayers";
import { moonPhase as lunarPhase } from "@/components/prototypes/celestial/lunar";

/**
 * Astronomical moon phase (0 = new, 0.5 = full) for a calendar day → tiny moon
 * glyph. Convert via the pure toCalendar() because `day.toDate()` misbehaves
 * inside reka-ui's calendar slot. Pure/stateless so it can be imported directly.
 */
export function lunarPhaseOfDay(day: DateValue) {
  const g = toCalendar(day, new GregorianCalendar());
  return lunarPhase(new Date(Date.UTC(g.year, g.month - 1, g.day, 12)));
}

/**
 * Dual Hijri/Gregorian calendar state + formatting, independent of any view.
 *
 * Encapsulates the selected date, the visible month placeholder, calendar-system
 * switching and the date/tooltip formatters so pages (index, tray) and the
 * CalendarDrawer can share one source of truth instead of duplicating ~120 lines.
 */
export function useHijriCalendar() {
  const timeZone = getLocalTimeZone();

  const islamicDate = shallowRef(
    toCalendar(today(timeZone), new IslamicUmalquraCalendar()),
  );
  const gregorianDate = shallowRef(
    toCalendar(today(timeZone), new GregorianCalendar()),
  );
  const calendarSystem = shallowRef<"islamic" | "gregorian">("islamic");

  const calendarDate = computed<CalendarDate>({
    get() {
      return calendarSystem.value === "islamic"
        ? (islamicDate.value as CalendarDate)
        : (gregorianDate.value as CalendarDate);
    },
    set(val: CalendarDate) {
      if (calendarSystem.value === "islamic") {
        islamicDate.value = toCalendar(val, new IslamicUmalquraCalendar());
      } else {
        gregorianDate.value = toCalendar(val, new GregorianCalendar());
      }
    },
  });

  const calendarPlaceholder = shallowRef<CalendarDate>(calendarDate.value);

  const gregorianFormatter = new DateFormatter("en-US", { dateStyle: "long" });
  const monthYearFormatter = new DateFormatter("en-US", {
    month: "long",
    year: "numeric",
  });

  /**
   * Format an Islamic date using hardcoded month names. This avoids
   * Intl.DateTimeFormat issues on Android WebViews which don't properly
   * support Islamic calendar locales.
   */
  function formatIslamicDate(date: DateValue): string {
    const islamic =
      date.calendar instanceof IslamicUmalquraCalendar
        ? date
        : toCalendar(date, new IslamicUmalquraCalendar());
    const monthName = ISLAMIC_MONTHS[islamic.month - 1] || `Month ${islamic.month}`;
    return `${islamic.day} ${monthName} ${islamic.year} AH`;
  }

  const calendarHeading = computed(() => {
    const date = calendarPlaceholder.value;
    if (calendarSystem.value === "islamic") {
      const islamic =
        date.calendar instanceof IslamicUmalquraCalendar
          ? date
          : toCalendar(date, new IslamicUmalquraCalendar());
      const monthName =
        ISLAMIC_MONTHS[islamic.month - 1] || `Month ${islamic.month}`;
      return `${monthName} ${islamic.year}`;
    }
    const greg =
      date.calendar instanceof GregorianCalendar
        ? date
        : toCalendar(date, new GregorianCalendar());
    return monthYearFormatter.format(greg.toDate(timeZone));
  });

  function formatTooltip(date: DateValue) {
    if (calendarSystem.value === "islamic") {
      // When viewing Islamic calendar, tooltip shows Gregorian date
      const greg = toCalendar(date, new GregorianCalendar());
      return gregorianFormatter.format(greg.toDate(timeZone));
    }
    // When viewing Gregorian calendar, tooltip shows Islamic date
    return formatIslamicDate(date);
  }

  const isToday = computed(() => {
    const baseToday = today(timeZone);
    const todayInSystem = toCalendar(
      baseToday,
      calendarSystem.value === "islamic"
        ? new IslamicUmalquraCalendar()
        : new GregorianCalendar(),
    );
    return calendarDate.value.compare(todayInSystem) === 0;
  });

  function toggleCalendarSystem() {
    if (calendarSystem.value === "islamic") {
      gregorianDate.value = toCalendar(islamicDate.value, new GregorianCalendar());
      calendarSystem.value = "gregorian";
      calendarPlaceholder.value = toCalendar(
        calendarPlaceholder.value,
        new GregorianCalendar(),
      ) as CalendarDate;
    } else {
      islamicDate.value = toCalendar(gregorianDate.value, new IslamicUmalquraCalendar());
      calendarSystem.value = "islamic";
      calendarPlaceholder.value = toCalendar(
        calendarPlaceholder.value,
        new IslamicUmalquraCalendar(),
      ) as CalendarDate;
    }
  }

  function selectToday() {
    const cal =
      calendarSystem.value === "islamic"
        ? new IslamicUmalquraCalendar()
        : new GregorianCalendar();
    const todayInSystem = toCalendar(today(timeZone), cal);
    if (calendarSystem.value === "islamic") {
      islamicDate.value = todayInSystem;
    } else {
      gregorianDate.value = todayInSystem;
    }
    calendarPlaceholder.value = todayInSystem as CalendarDate;
  }

  return {
    timeZone,
    calendarSystem,
    calendarDate,
    calendarPlaceholder,
    calendarHeading,
    isToday,
    formatIslamicDate,
    formatTooltip,
    toggleCalendarSystem,
    selectToday,
    lunarPhaseOf: lunarPhaseOfDay,
  };
}
