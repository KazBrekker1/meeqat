/**
 * How many days ahead the "Add to calendar" feed covers, counting today.
 * The limits mirror the service (services/together/internal/calendar/ics.go).
 */
export const CALENDAR_DAYS_DEFAULT = 60;
export const CALENDAR_DAYS_MIN = 1;
export const CALENDAR_DAYS_MAX = 90;

/** Ranges offered by name; anything else is a custom number of days. */
export const CALENDAR_RANGE_PRESETS: { days: number; label: string }[] = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
];

/** A whole number of days the service accepts; the default for anything that isn't a number. */
export function clampCalendarDays(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return CALENDAR_DAYS_DEFAULT;
  return Math.min(CALENDAR_DAYS_MAX, Math.max(CALENDAR_DAYS_MIN, Math.round(n)));
}

export function isCalendarRangePreset(days: number): boolean {
  return CALENDAR_RANGE_PRESETS.some((p) => p.days === days);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * The feed's path: digits, dots and slashes only, ending in .ics — calendar
 * services re-encode or refuse links with a query string. The default range
 * keeps the link without a days segment, the one already-subscribed calendars use.
 */
export function calendarFeedPath(lat: number, lng: number, methodId: number, days: number): string {
  const place = `/cal/${round3(lat)}/${round3(lng)}/${methodId}`;
  const range = clampCalendarDays(days);
  return range === CALENDAR_DAYS_DEFAULT ? `${place}/prayers.ics` : `${place}/${range}/prayers.ics`;
}
