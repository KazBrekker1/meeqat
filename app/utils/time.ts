import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { prayerClock } from "@/utils/prayerClock";

// --- Basic helpers ---

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function getMinutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function getSecondsOfDay(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

export function resetToMidnight(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// --- Time-of-day parsing ---

/**
 * Minutes after midnight from "HH:MM" (anything after it, such as " (+03)", is
 * ignored) or "h:mm AM/PM"; null when it is neither. The app's only parser for
 * a time of day.
 */
export function parseTimeToMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const minutes = Number(ampmMatch[2]);
    const isPM = ampmMatch[3]?.toUpperCase() === "PM";
    if (hours === 12) hours = 0;
    return (isPM ? hours + 12 : hours) * 60 + minutes;
  }
  const parts = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (!parts) return null;
  const h = Number(parts[1]);
  const m = Number(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

// --- Date key formatting ---

export function getDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDdMmYyyy(d: Date): string {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function parseYyyyMmDd(
  yyyyMmDd: string
): { year: number; month: number; day: number } | null {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  return { year, month, day };
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function ddmmyyyyToYyyymmdd(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// --- Time difference ---

export interface TimeDiff {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

export function getTimeDiff(from: Date, to: Date): TimeDiff {
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, totalSeconds };
}

export function formatTimeDiff(diff: TimeDiff): string {
  return `${pad2(diff.hours)}:${pad2(diff.minutes)}:${pad2(diff.seconds)}`;
}

// --- Reactive time refs ---

export function buildCurrentTimeRefs(now: Ref<Date>) {
  const nowMinutes = computed(() => getMinutesOfDay(now.value));
  const nowSecondsOfDay = computed(() => getSecondsOfDay(now.value));
  return { nowMinutes, nowSecondsOfDay };
}

// --- Prayer time calculations ---

export function computePreviousPrayerInfo(
  timingsList: Array<{ key: string; label: string; minutes?: number }>,
  now: Date
): { label: string; timeSince: string } | null {
  const list = timingsList
    .filter((t) => typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key))
    .sort((a, b) => (a.minutes as number) - (b.minutes as number));

  const prev = prayerClock(list, getSecondsOfDay(now)).previous;
  if (!prev || typeof prev.minutes !== "number") return null;

  const prevDate = resetToMidnight(now);
  prevDate.setMinutes(prev.minutes, 0, 0);
  if (prevDate.getTime() > now.getTime()) {
    prevDate.setDate(prevDate.getDate() - 1);
  }

  const diff = getTimeDiff(prevDate, now);
  return {
    label: prev.label,
    timeSince: formatTimeDiff(diff),
  };
}

// --- Timezones ---

/** Minutes east of UTC for an IANA timezone at an instant; null if the zone is unknown here. */
export function getUtcOffsetMinutes(tz: string, at: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(at);
    const part = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value);
    const wallClock = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    );
    const offset = Math.round(
      (wallClock - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000,
    );
    return Number.isFinite(offset) ? offset : null;
  } catch {
    return null;
  }
}

/** "GMT+3", "GMT-3:30" */
export function formatUtcOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${minutes < 0 ? "-" : "+"}${h}${m ? `:${pad2(m)}` : ""}`;
}
