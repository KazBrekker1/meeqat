import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";

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

  if (!list.length) return null;

  const currentMinutes = getMinutesOfDay(now);
  let nextIdx = list.findIndex((t) => (t.minutes as number) > currentMinutes);
  if (nextIdx === -1) nextIdx = 0;

  const prev = list[(nextIdx - 1 + list.length) % list.length];
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
