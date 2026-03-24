const ALADHAN_BASE = "https://api.aladhan.com/v1";

export const API_MIRRORS = [
  "https://api.aladhan.com/v1",
  "https://aladhan.api.islamic.network/v1",
] as const;

// --- Shared param types ---

export interface PrayerApiParams {
  methodId: number;
  shafaq: string;
  tz: string;
  calendarMethod: string;
}

export interface CityParams extends PrayerApiParams {
  city: string;
  country: string;
}

export interface CoordParams extends PrayerApiParams {
  lat: number;
  lng: number;
}

// --- URL builder ---

function buildUrl(
  base: string,
  endpoint: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(`${base}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function sharedParams(p: PrayerApiParams): Record<string, string | number> {
  return {
    method: p.methodId,
    shafaq: p.shafaq,
    timezonestring: p.tz,
    calendarMethod: p.calendarMethod,
  };
}

// --- Single-day endpoints ---

export function buildTimingsByCoordinatesUrl(
  dateParam: string,
  params: CoordParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `timings/${dateParam}`, {
    latitude: params.lat,
    longitude: params.lng,
    ...sharedParams(params),
  });
}

export function buildTimingsByCityUrl(
  dateParam: string,
  params: CityParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `timingsByCity/${dateParam}`, {
    city: params.city,
    country: params.country,
    ...sharedParams(params),
  });
}

// --- Calendar endpoints (month at a time) ---

export function buildCalendarByCoordinatesUrl(
  year: number,
  month: number,
  params: CoordParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `calendar/${year}/${month}`, {
    latitude: params.lat,
    longitude: params.lng,
    ...sharedParams(params),
  });
}

export function buildCalendarByCityUrl(
  year: number,
  month: number,
  params: CityParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `calendarByCity/${year}/${month}`, {
    city: params.city,
    country: params.country,
    ...sharedParams(params),
  });
}
