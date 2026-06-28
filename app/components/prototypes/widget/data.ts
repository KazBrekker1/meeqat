// PROTOTYPE sample data for the widget lab. Mirrors the fields the real
// PrayerWidgetProvider binds (next/prev prayer, countdown, 6 rows, dates, city).
import type { BumpPrayer } from "@/components/prototypes/orbit/bump";

export interface WidgetPrayer {
  label: string;
  time: string;
  next?: boolean;
  past?: boolean;
}

export interface WidgetData {
  city: string;
  hijri: string;
  greg: string;
  now: string; // current local time (clock)
  moonPhase: number;
  /** Fraction (0–1) elapsed between the previous and next prayer. */
  progress: number;
  next: { label: string; time: string; countdown: string };
  prev: { label: string; elapsed: string };
  prayers: WidgetPrayer[];
}

export const SAMPLE: WidgetData = {
  city: "Doha, QA",
  hijri: "16 Muharram 1447",
  greg: "Mon, Jul 1",
  now: "2:30 PM",
  moonPhase: 0.52, // ~full
  progress: 0.68, // Dhuhr → Asr
  next: { label: "Asr", time: "3:42", countdown: "1:12:40" },
  prev: { label: "Dhuhr", elapsed: "47m ago" },
  prayers: [
    { label: "Fajr", time: "4:21", past: true },
    { label: "Sunrise", time: "5:38", past: true },
    { label: "Dhuhr", time: "11:54", past: true },
    { label: "Asr", time: "3:42", next: true },
    { label: "Maghrib", time: "6:39" },
    { label: "Isha", time: "8:01" },
  ],
};

// 24-hour times + current clock so the orbit (OrbitBumps) can place its dots and
// now-marker. Mirrors SAMPLE.prayers; Asr is next, "now" sits between Dhuhr→Asr.
export const ORBIT_PRAYERS: BumpPrayer[] = [
  { key: "fajr", time: "4:21", isPast: true },
  { key: "sunrise", time: "5:38", isPast: true },
  { key: "dhuhr", time: "11:54", isPast: true },
  { key: "asr", time: "15:42", isNext: true },
  { key: "maghrib", time: "18:39" },
  { key: "isha", time: "20:01" },
];
export const NOW_HHMM = "14:30";
