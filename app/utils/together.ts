/** Display helpers shared by the Pray Together pages. */

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha", "jumuah"] as const;
export type PrayerId = (typeof PRAYERS)[number];

export function prayerName(prayer: string): string {
  return prayer === "jumuah" ? "Jumu'ah" : prayer.charAt(0).toUpperCase() + prayer.slice(1);
}

/** "3:30 PM" in the viewer's locale, from a PocketBase datetime. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** "HH:MM" from a time input → ISO datetime today (tomorrow if already past by > 1 h). */
export function timeInputToIso(hhmm: string): string | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now() - 60 * 60 * 1000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** Weekday of `now` in an IANA time zone (0 = Sunday). */
export function weekdayIn(tz: string, now = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
