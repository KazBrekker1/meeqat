export const PRAYER_ORDER = [
  ["Fajr", "Fajr"],
  ["Sunrise", "Sunrise"],
  ["Dhuhr", "Dhuhr"],
  ["Asr", "Asr"],
  ["Maghrib", "Maghrib"],
  ["Isha", "Isha"],
] as const;

// Extended prayer times (calculated from main times)
export const EXTENDED_PRAYER_ORDER = [
  ["Fajr", "Fajr"],
  ["Sunrise", "Sunrise"],
  ["Ishraq", "Ishraq"],      // ~15-20 min after sunrise
  ["Duha", "Duha"],          // Mid-morning (between sunrise and dhuhr)
  ["Dhuhr", "Dhuhr"],
  ["Asr", "Asr"],
  ["Maghrib", "Maghrib"],
  ["Isha", "Isha"],
  ["Tahajjud", "Tahajjud"],  // Last third of night
  ["Imsak", "Imsak"],        // ~10 min before Fajr (for Ramadan)
] as const;

export const MAIN_PRAYER_KEYS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
export const MAIN_PRAYER_KEYS_SET = new Set<string>(MAIN_PRAYER_KEYS);

export const ADDITIONAL_PRAYER_KEYS = ["Ishraq", "Duha", "Tahajjud", "Imsak", "Midnight", "Firstthird", "Lastthird"] as const;
export const ADDITIONAL_PRAYER_KEYS_SET = new Set<string>(ADDITIONAL_PRAYER_KEYS);

export type PrayerKey = (typeof PRAYER_ORDER)[number][0];
export type MainPrayerKey = (typeof MAIN_PRAYER_KEYS)[number];
export type AdditionalPrayerKey = (typeof ADDITIONAL_PRAYER_KEYS)[number];

// Prayer time descriptions for UI
export const PRAYER_DESCRIPTIONS: Record<string, string> = {
  Fajr: "Dawn prayer",
  Sunrise: "Sun rises",
  Ishraq: "Post-sunrise prayer (~15 min after)",
  Duha: "Mid-morning prayer",
  Dhuhr: "Noon prayer",
  Asr: "Afternoon prayer",
  Maghrib: "Sunset prayer",
  Isha: "Night prayer",
  Tahajjud: "Night vigil (last third)",
  Imsak: "Stop eating (Ramadan)",
  Midnight: "Islamic midnight",
  Firstthird: "End of first third of night",
  Lastthird: "Start of last third of night",
};

// Ramadan-specific times
export const RAMADAN_TIMES = ["Imsak", "Fajr", "Maghrib"] as const;
export const RAMADAN_TIMES_SET = new Set<string>(RAMADAN_TIMES);
