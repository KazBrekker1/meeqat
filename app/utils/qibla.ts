/**
 * Qibla direction + distance math. Pure functions, no platform dependencies.
 *
 * The Qibla is the great-circle bearing from the user's position to the Kaaba in
 * Makkah. We report the INITIAL bearing of that great circle (the direction you
 * set off in), measured clockwise from true north — the standard convention for
 * Qibla compasses.
 */

/** Kaaba, Masjid al-Haram, Makkah. */
export const KAABA = { lat: 21.4224779, lng: 39.6234343 } as const;

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Initial great-circle bearing from (lat, lng) to the Kaaba, in degrees
 * clockwise from true north, normalized to [0, 360).
 */
export function qiblaBearing(lat: number, lng: number): number {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δλ = toRad(KAABA.lng - lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle (haversine) distance in km from (lat, lng) to the Kaaba. */
export function distanceToKaabaKm(lat: number, lng: number): number {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δφ = toRad(KAABA.lat - lat);
  const Δλ = toRad(KAABA.lng - lng);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
] as const;

/** 16-point compass label for a bearing in degrees, e.g. 118 → "ESE". */
export function compassPoint(bearing: number): string {
  const i = Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[i]!;
}

/**
 * Smallest absolute angular difference between two bearings, in degrees [0, 180].
 * Used to tell whether the device is currently pointing at the Qibla.
 */
export function angularDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}
