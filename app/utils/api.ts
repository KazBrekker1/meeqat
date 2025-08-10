export function buildTimingsByCityUrl(
  dateParam: string,
  city: string,
  country: string,
  methodId: number,
  shafaq: string,
  tz: string,
  calendarMethod: string
): string {
  return `https://api.aladhan.com/v1/timingsByCity/${encodeURIComponent(
    dateParam
  )}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(
    country
  )}&method=${encodeURIComponent(String(methodId))}&shafaq=${encodeURIComponent(
    shafaq
  )}&timezonestring=${encodeURIComponent(
    tz
  )}&calendarMethod=${encodeURIComponent(calendarMethod)}`;
}
