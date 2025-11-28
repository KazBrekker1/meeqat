export function getDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
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

export function buildCurrentTimeRefs(now: Ref<Date>) {
  const nowMinutes = computed(
    () => now.value.getHours() * 60 + now.value.getMinutes()
  );
  const nowSecondsOfDay = computed(
    () =>
      now.value.getHours() * 3600 +
      now.value.getMinutes() * 60 +
      now.value.getSeconds()
  );
  return { nowMinutes, nowSecondsOfDay };
}

export interface PrayerTimeInfo {
  key: string;
  label: string;
  minutes: number;
}

/**
 * Finds the previous prayer and calculates time elapsed since it.
 * Returns null if no valid prayer times are available.
 */
export function computePreviousPrayerInfo(
  timingsList: Array<{ key: string; label: string; minutes?: number }>,
  now: Date
): { label: string; timeSince: string } | null {
  const allowedKeys = new Set(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  const list = timingsList
    .filter((t) => typeof t.minutes === "number" && allowedKeys.has(t.key))
    .sort((a, b) => (a.minutes as number) - (b.minutes as number));

  if (!list.length) return null;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let nextIdx = list.findIndex((t) => (t.minutes as number) > currentMinutes);
  if (nextIdx === -1) nextIdx = 0;

  const prev = list[(nextIdx - 1 + list.length) % list.length];
  if (!prev || typeof prev.minutes !== "number") return null;

  const prevDate = new Date(now);
  prevDate.setHours(0, 0, 0, 0);
  prevDate.setMinutes(prev.minutes, 0, 0);
  if (prevDate.getTime() > now.getTime()) {
    // previous prayer was yesterday
    prevDate.setDate(prevDate.getDate() - 1);
  }

  const diffMs = Math.max(0, now.getTime() - prevDate.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return {
    label: prev.label,
    timeSince: `${hh}:${mm}:${ss}`,
  };
}
