import {
  CalendarDate,
  IslamicUmalquraCalendar,
  toCalendar,
  type DateValue,
} from "@internationalized/date";
import { ISLAMIC_MONTHS } from "@/constants/prayers";

// Hijri (Umm al-Qura) dates as text. Month names are hardcoded: Android WebViews
// don't properly support the Islamic calendar locales in Intl.DateTimeFormat.

/** A calendar date (any calendar) or a local JS day, in the Umm al-Qura calendar. */
export function toHijri(date: DateValue | Date): DateValue {
  if (date instanceof Date) {
    return toCalendar(
      new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      new IslamicUmalquraCalendar(),
    );
  }
  return date.calendar instanceof IslamicUmalquraCalendar
    ? date
    : toCalendar(date, new IslamicUmalquraCalendar());
}

function hijriMonthName(month: number): string {
  return ISLAMIC_MONTHS[month - 1] || `Month ${month}`;
}

/** "12 Rabi' al-Thani 1448 AH" */
export function formatHijriDate(date: DateValue): string {
  const islamic = toHijri(date);
  return `${islamic.day} ${hijriMonthName(islamic.month)} ${islamic.year} AH`;
}

/** "Rabi' al-Thani 1448" */
export function formatHijriMonthYear(date: DateValue): string {
  const islamic = toHijri(date);
  return `${hijriMonthName(islamic.month)} ${islamic.year}`;
}

/** "12 Rabi' al-Thani 1448 AH" for a local calendar day (Umm al-Qura). */
export function formatHijriVerbose(date: Date): string | null {
  try {
    return formatHijriDate(toHijri(date));
  } catch (e) {
    console.error("[hijri] Failed to format Hijri date:", e);
    return null;
  }
}
