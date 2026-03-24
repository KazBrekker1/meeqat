import { resetToMidnight } from "@/utils/time";

// Cache Intl.DateTimeFormat instances — construction is ~10x slower than .format()
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getCachedFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(undefined, options);
    formatterCache.set(key, fmt);
  }
  return fmt;
}

export function formatTime(
  date: Date,
  is24Hour: ComputedRef<boolean> | boolean,
  tz?: string,
  includeSeconds = false,
): string {
  const twentyFour = typeof is24Hour === "boolean" ? is24Hour : is24Hour.value;
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !twentyFour,
  };
  if (includeSeconds) options.second = "2-digit";
  if (tz) options.timeZone = tz;
  try {
    return getCachedFormatter(options).format(date).replace(/^24:/, "00:");
  } catch {
    return date
      .toLocaleTimeString(undefined, options as any)
      .replace(/^24:/, "00:");
  }
}

export function formatDateInTimezone(
  date: Date,
  is24Hour: ComputedRef<boolean> | boolean,
  tz: string,
): string {
  return formatTime(date, is24Hour, tz, false);
}

export function formatMinutesLocal(
  minutes: number,
  is24Hour: ComputedRef<boolean> | boolean,
): string {
  const base = resetToMidnight(new Date());
  base.setMinutes(minutes);
  return formatTime(base, is24Hour);
}
