export const PRAYER_ORDER = [
  ["Fajr", "Fajr"],
  ["Sunrise", "Sunrise"],
  ["Dhuhr", "Dhuhr"],
  ["Asr", "Asr"],
  ["Maghrib", "Maghrib"],
  ["Isha", "Isha"],
] as const;

export const MAIN_PRAYER_KEYS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
export const MAIN_PRAYER_KEYS_SET = new Set<string>(MAIN_PRAYER_KEYS);

export type PrayerKey = (typeof PRAYER_ORDER)[number][0];
export type MainPrayerKey = (typeof MAIN_PRAYER_KEYS)[number];
