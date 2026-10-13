// Validation of the two Aladhan responses the app reads, by hand: only the fields
// the app uses are checked, which keeps a schema library out of the bundle.

export interface DayData {
  timings: Record<string, string>;
  date: { readable: string; gregorian: { date: string } };
  meta: { timezone: string; method?: { name: string } };
}

// Single-day response (for on-demand date picks)
export interface PrayerTimingsResponse {
  code: 200;
  data: DayData;
}

// Calendar/month response (replaces 30 individual prefetch calls)
export interface PrayerCalendarResponse {
  code: 200;
  data: DayData[];
}

const INVALID = "Unexpected response from the prayer times service";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseDay(v: unknown): DayData {
  if (!isObject(v)) throw new Error(INVALID);
  const { timings, date, meta } = v;
  if (!isObject(timings) || !isObject(date) || !isObject(meta)) {
    throw new Error(INVALID);
  }
  if (!Object.values(timings).every((t) => typeof t === "string")) {
    throw new Error(INVALID);
  }
  const gregorian = date.gregorian;
  if (
    typeof date.readable !== "string" ||
    !isObject(gregorian) ||
    typeof gregorian.date !== "string" ||
    typeof meta.timezone !== "string"
  ) {
    throw new Error(INVALID);
  }
  const method = meta.method;
  return {
    timings: timings as Record<string, string>,
    date: { readable: date.readable, gregorian: { date: gregorian.date } },
    meta: {
      timezone: meta.timezone,
      method:
        isObject(method) && typeof method.name === "string"
          ? { name: method.name }
          : undefined,
    },
  };
}

export function parsePrayerTimingsResponse(raw: unknown): PrayerTimingsResponse {
  if (!isObject(raw) || raw.code !== 200) throw new Error(INVALID);
  return { code: 200, data: parseDay(raw.data) };
}

export function parsePrayerCalendarResponse(raw: unknown): PrayerCalendarResponse {
  if (!isObject(raw) || raw.code !== 200 || !Array.isArray(raw.data)) {
    throw new Error(INVALID);
  }
  return { code: 200, data: raw.data.map(parseDay) };
}
