export function formatTime(
  date: Date,
  is24Hour: ComputedRef<boolean> | boolean,
  tz?: string,
  includeSeconds = false
): string {
  const twentyFour = typeof is24Hour === "boolean" ? is24Hour : is24Hour.value;
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !twentyFour,
  };
  if (includeSeconds) baseOptions.second = "2-digit";
  if (tz) baseOptions.timeZone = tz;
  try {
    return new Intl.DateTimeFormat(undefined, baseOptions)
      .format(date)
      .replace(/^24:/, "00:");
  } catch {
    return date
      .toLocaleTimeString(undefined, baseOptions as any)
      .replace(/^24:/, "00:");
  }
}

export function formatDateInTimezone(
  date: Date,
  is24Hour: ComputedRef<boolean> | boolean,
  tz: string
): string {
  return formatTime(date, is24Hour, tz, false);
}

export function formatMinutesLocal(
  minutes: number,
  is24Hour: ComputedRef<boolean> | boolean
): string {
  const base = new Date();
  base.setSeconds(0, 0);
  base.setHours(0, 0, 0, 0);
  base.setMinutes(minutes);
  return formatTime(base, is24Hour);
}
